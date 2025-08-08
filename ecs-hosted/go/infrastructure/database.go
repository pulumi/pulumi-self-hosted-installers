package main

import (
	"errors"
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/ec2"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/iam"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/rds"
	"github.com/pulumi/pulumi-random/sdk/v4/go/random"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/infrastructure/common"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func NewDatabase(ctx *pulumi.Context, name string, args *DatabaseArgs, opts ...pulumi.ResourceOption) (*Database, error) {
	var resource Database

	err := ctx.RegisterComponentResource("pulumi:auroraDatabase", name, &resource, opts...)
	if err != nil {
		return nil, err
	}

	// create our parented options
	options := append(opts, pulumi.Parent(&resource))

	// don't allow any ingress by default; API service will need to create ingress for this sg.
	securityGroup, err := ec2.NewSecurityGroup(ctx, ToCommonName(name, "db-sg"), &ec2.SecurityGroupArgs{
		VpcId: args.vpcId,
	}, options...)

	if err != nil {
		return nil, err
	}

	subnetGroup, err := rds.NewSubnetGroup(ctx, ToCommonName(name, "subnet-group"), &rds.SubnetGroupArgs{
		SubnetIds: args.isolatedSubnetIds,
	}, options...)

	if err != nil {
		return nil, err
	}

	dbPassword, err := random.NewRandomPassword(ctx, ToCommonName(name, "db-password"), &random.RandomPasswordArgs{
		Length:          pulumi.Int(16),
		OverrideSpecial: pulumi.String("_"),
		Special:         pulumi.BoolPtr(true),
	}, options...)

	if err != nil {
		return nil, err
	}

	finalSnapshotId, err := random.NewRandomId(ctx, ToCommonName(name, "snapshot-id"), &random.RandomIdArgs{
		Prefix:     pulumi.String("snapshot-"),
		ByteLength: pulumi.Int(16),
	}, options...)

	if err != nil {
		return nil, err
	}

	engine := "aurora-mysql"
	engineVersion := "8.0.mysql_aurora.3.07.0"

	clusterOpts := append(options, pulumi.Protect(true))
	cluster, err := rds.NewCluster(ctx, ToCommonName(name, "aurora-cluster"), &rds.ClusterArgs{
		ApplyImmediately:        pulumi.BoolPtr(true),
		BackupRetentionPeriod:   pulumi.Int(7), // days
		CopyTagsToSnapshot:      pulumi.BoolPtr(true),
		DatabaseName:            pulumi.String("pulumi"),
		DbSubnetGroupName:       subnetGroup.ID(), // misleading ... its ID not name
		DeletionProtection:      pulumi.BoolPtr(false),
		Engine:                  pulumi.String(engine),
		EngineVersion:           pulumi.String(engineVersion),
		FinalSnapshotIdentifier: finalSnapshotId.Hex,
		MasterUsername:          pulumi.String("pulumi"),
		MasterPassword:          dbPassword.Result,
		StorageEncrypted:        pulumi.BoolPtr(true),
		VpcSecurityGroupIds:     pulumi.StringArray{securityGroup.ID()},
	}, clusterOpts...)

	if err != nil {
		return nil, err
	}

	// Enable the general and slow query logs and write them to files on the RDS instance.
	parameterGroup, err := rds.NewParameterGroup(ctx, ToCommonName(name, "instance-options"), &rds.ParameterGroupArgs{
		Family: pulumi.String("aurora-mysql8.0"),
		Parameters: rds.ParameterGroupParameterArray{
			&rds.ParameterGroupParameterArgs{
				Name:  pulumi.String("slow_query_log"),
				Value: pulumi.String("1"),
			},
			&rds.ParameterGroupParameterArgs{
				Name:  pulumi.String("long_query_time"),
				Value: pulumi.String("4.9"),
			},
			&rds.ParameterGroupParameterArgs{
				Name:  pulumi.String("log_queries_not_using_indexes"),
				Value: pulumi.String("1"),
			},
			&rds.ParameterGroupParameterArgs{
				Name:  pulumi.String("general_log"),
				Value: pulumi.String("1"),
			},
			&rds.ParameterGroupParameterArgs{
				Name:  pulumi.String("log_output"),
				Value: pulumi.String("FILE"),
			},
		},
	}, options...)

	if err != nil {
		return nil, err
	}

	// govcloud policy arns are different from non-govcloud
	monitoringArn := common.GetIamPolicyArn(args.region, "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole")

	monitoringRole, err := iam.NewRole(ctx, ToCommonName(name, "instance-monitoring-role"), &iam.RoleArgs{
		AssumeRolePolicy: pulumi.String(`{
			"Version": "2012-10-17",
			"Statement": [{
				"Sid": "",
				"Effect": "Allow",
				"Principal": {
					"Service": "monitoring.rds.amazonaws.com"
				},
				"Action": "sts:AssumeRole"
			}]
		}`),
	}, options...)

	if err != nil {
		return nil, err
	}

	// NOTE: below ARN does not exist in govcloud. instead of arn:aws:... govcloud uses arn:aws-us-gov:...
	_, err = iam.NewRolePolicyAttachment(ctx, ToCommonName(name, "instanace-monitoring-rp"), &iam.RolePolicyAttachmentArgs{
		Role:      monitoringRole.Name,
		PolicyArn: pulumi.String(monitoringArn),
	}, options...)

	if err != nil {
		return nil, err
	}

	// instances

	// Add a second database instance. This ensures we have instances
	// spread across multiple AZs. If there is a problem with the primary instance, Aurora will
	// do an automated failover. We can also manually fail-over ourselves via the AWS Console.
	//
	// See: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Replication.html
	// for more information on how Auora handles failover and read replicas.

	// max is 3 instances (1 master, 2 replica)

	if args.numberDbReplicas > 2 {
		return nil, errors.New("number db replicas cannot be greater than 2")
	}

	if args.numberDbReplicas < 0 {
		return nil, errors.New("number db replicas cannot be less than 0")
	}

	// the '1' accounts for our master instance
	numberInstances := args.numberDbReplicas + 1
	for i := 0; i < numberInstances; i++ {
		instanceId := fmt.Sprintf("instance-%d", i)
		_, err := rds.NewClusterInstance(ctx, ToCommonName(name, instanceId), &rds.ClusterInstanceArgs{
			ClusterIdentifier:    cluster.ID(),
			Engine:               rds.EngineType(engine),
			EngineVersion:        pulumi.String(engineVersion),
			InstanceClass:        args.instanceType,
			DbParameterGroupName: parameterGroup.Name,
			MonitoringInterval:   pulumi.Int(5),
			MonitoringRoleArn:    monitoringRole.Arn,
		}, clusterOpts...)

		if err != nil {
			return nil, err
		}
	}

	// output specific values to prevent any leaky abstractions
	resource.dbClusterEndpoint = cluster.Endpoint
	resource.dbName = cluster.DatabaseName
	resource.dbUsername = cluster.MasterUsername
	resource.dbPassword = dbPassword.Result
	resource.dbSecurityGroupId = securityGroup.ID()
	resource.dbPort = cluster.Port

	return &resource, nil
}

type Database struct {
	pulumi.ResourceState

	dbClusterEndpoint pulumi.StringOutput
	dbName            pulumi.StringOutput
	dbUsername        pulumi.StringOutput
	dbPassword        pulumi.StringOutput
	dbSecurityGroupId pulumi.IDOutput
	dbPort            pulumi.IntOutput
}

type DatabaseArgs struct {
	vpcId             pulumi.String
	isolatedSubnetIds pulumi.StringArrayInput
	numberDbReplicas  int
	instanceType      pulumi.String
	region            string
}
