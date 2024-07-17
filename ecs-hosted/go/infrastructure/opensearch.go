package main

import (
	"fmt"
	"strings"

	"github.com/pulumi/pulumi-aws/sdk/v6/go/aws/cloudwatch"
	"github.com/pulumi/pulumi-aws/sdk/v6/go/aws/ec2"
	"github.com/pulumi/pulumi-aws/sdk/v6/go/aws/opensearch"
	"github.com/pulumi/pulumi-random/sdk/v4/go/random"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumiverse/pulumi-time/sdk/go/time"
)

type OpenSearchArgs struct {
	AccountId            string
	Region               string
	DomainName           string
	DeployOpenSearch     bool
	InstanceType         string
	InstanceCount        int
	VpcId                string
	SubnetIds            []string
	DedicatedMasterCount int
}

func NewOpenSearch(ctx *pulumi.Context, name string, args *OpenSearchArgs, opts ...pulumi.ResourceOption) (*Opensearch, error) {
	var resource Opensearch

	if !args.DeployOpenSearch {
		return nil, nil
	}

	un := "admin"

	err := validateNetworkConfiguration(args.SubnetIds, args.InstanceCount)

	if err != nil {
		return nil, err
	}

	err = ctx.RegisterComponentResource("pulumi:opensearch", name, &resource, opts...)
	if err != nil {
		return nil, err
	}

	// create our parented options
	options := append(opts, pulumi.Parent(&resource))

	// open search has a specific domain name so we need to specify deleteBeforeReplace
	opensearchOpts := append(options, pulumi.Timeouts(&pulumi.CustomTimeouts{Create: "5h"}), pulumi.DeleteBeforeReplace(true))

	sg, err := ec2.NewSecurityGroup(ctx, name, &ec2.SecurityGroupArgs{
		VpcId: pulumi.String(args.VpcId),
		Ingress: ec2.SecurityGroupIngressArray{
			&ec2.SecurityGroupIngressArgs{
				Protocol: pulumi.String("tcp"),
				FromPort: pulumi.Int(443),
				ToPort:   pulumi.Int(443),
				// TODO: we should have the cide of the VPC or at least we should be able to get it
				CidrBlocks: pulumi.StringArray{
					pulumi.String("0.0.0.0/0"),
				},
			},
		},
	}, options...)

	if err != nil {
		return nil, err
	}

	dme := false
	if args.DedicatedMasterCount > 0 {
		dme = true
	}

	zae := false
	if len(args.SubnetIds) > 1 {
		zae = true
	}

	offset, err := time.NewOffset(ctx, getCommonName(name, "maintenancealert"), &time.OffsetArgs{
		OffsetDays: pulumi.Int(7),
	}, options...)

	if err != nil {
		return nil, err
	}

	autotuneOptions := &opensearch.DomainAutoTuneOptionsArgs{
		DesiredState:      pulumi.String("ENABLED"),
		RollbackOnDisable: pulumi.String("NO_ROLLBACK"),
		MaintenanceSchedules: opensearch.DomainAutoTuneOptionsMaintenanceScheduleArray{
			&opensearch.DomainAutoTuneOptionsMaintenanceScheduleArgs{
				StartAt:                     offset.Rfc3339,
				CronExpressionForRecurrence: pulumi.String("cron(0 18 ? * MON-FRI *)"),
				Duration: &opensearch.DomainAutoTuneOptionsMaintenanceScheduleDurationArgs{
					Unit:  pulumi.String("HOURS"),
					Value: pulumi.Int(1),
				},
			},
		},
	}

	// autotune is not supported for burstable instances
	if strings.HasPrefix(args.InstanceType, "t2") || strings.HasPrefix(args.InstanceType, "t3") {
		autotuneOptions = nil
	}

	lg, err := newLogGroup(ctx, name, options...)
	if err != nil {
		return nil, err
	}

	pw, err := random.NewRandomPassword(ctx, getCommonName(name, "pw"), &random.RandomPasswordArgs{
		Length: pulumi.Int(16),
	}, options...)

	if err != nil {
		return nil, err
	}

	domain, err := opensearch.NewDomain(ctx, name, &opensearch.DomainArgs{
		DomainName:    pulumi.String(args.DomainName),
		EngineVersion: pulumi.String("OpenSearch_2.13"),
		ClusterConfig: &opensearch.DomainClusterConfigArgs{
			InstanceType:           pulumi.String(args.InstanceType),
			InstanceCount:          pulumi.Int(args.InstanceCount),
			DedicatedMasterEnabled: pulumi.Bool(dme),
			ZoneAwarenessEnabled:   pulumi.Bool(zae),
			ZoneAwarenessConfig: &opensearch.DomainClusterConfigZoneAwarenessConfigArgs{
				AvailabilityZoneCount: pulumi.Int(len(args.SubnetIds)),
			},
		},
		EbsOptions: &opensearch.DomainEbsOptionsArgs{
			EbsEnabled: pulumi.Bool(true),
			VolumeSize: pulumi.Int(10),
			VolumeType: pulumi.String("gp2"),
		},
		VpcOptions: &opensearch.DomainVpcOptionsArgs{
			SecurityGroupIds: pulumi.StringArray{
				sg.ID(),
			},
			SubnetIds: pulumi.ToStringArray(args.SubnetIds),
		},
		EncryptAtRest: &opensearch.DomainEncryptAtRestArgs{
			Enabled: pulumi.Bool(true),
		},
		NodeToNodeEncryption: &opensearch.DomainNodeToNodeEncryptionArgs{
			Enabled: pulumi.Bool(true),
		},
		DomainEndpointOptions: &opensearch.DomainDomainEndpointOptionsArgs{
			EnforceHttps:      pulumi.Bool(true),
			TlsSecurityPolicy: pulumi.String("Policy-Min-TLS-1-2-2019-07"),
		},
		AdvancedSecurityOptions: &opensearch.DomainAdvancedSecurityOptionsArgs{
			Enabled:                     pulumi.Bool(true),
			InternalUserDatabaseEnabled: pulumi.Bool(true),
			MasterUserOptions: &opensearch.DomainAdvancedSecurityOptionsMasterUserOptionsArgs{
				MasterUserName:     pulumi.String(un),
				MasterUserPassword: pw.Result,
			},
		},
		AutoTuneOptions: autotuneOptions,
		LogPublishingOptions: &opensearch.DomainLogPublishingOptionArray{
			&opensearch.DomainLogPublishingOptionArgs{
				CloudwatchLogGroupArn: lg.Arn,
				LogType:               pulumi.String("INDEX_SLOW_LOGS"),
			},
			&opensearch.DomainLogPublishingOptionArgs{
				CloudwatchLogGroupArn: lg.Arn,
				LogType:               pulumi.String("SEARCH_SLOW_LOGS"),
			},
			&opensearch.DomainLogPublishingOptionArgs{
				CloudwatchLogGroupArn: lg.Arn,
				LogType:               pulumi.String("ES_APPLICATION_LOGS"),
			},
			&opensearch.DomainLogPublishingOptionArgs{
				CloudwatchLogGroupArn: lg.Arn,
				LogType:               pulumi.String("AUDIT_LOGS"),
			},
		},
		AccessPolicies: pulumi.String(fmt.Sprintf(`{
			"Version": "2012-10-17",
			"Statement": [{
				"Effect": "Allow",
				"Principal": {
					"AWS": "*"
				},
				"Action": "es:*",
				"Resource": "arn:aws:es:%s:%s:domain/%s/*"
			}]
		}`, args.Region, args.AccountId, args.DomainName)),
	}, opensearchOpts...)

	if err != nil {
		return nil, err
	}

	resource.User = pulumi.String(un).ToStringOutput()
	resource.Password = pw.Result
	resource.Domain = domain.Endpoint
	resource.Endpoint = domain.Endpoint.ApplyT(func(endpoint string) string {
		return fmt.Sprintf("https://%s", endpoint)
	}).(pulumi.StringOutput)

	return &resource, nil
}

func validateNetworkConfiguration(subnetIds []string, instanceCount int) error {
	if len(subnetIds) > instanceCount {
		return fmt.Errorf("number of subnets must be less than or equal to the number of instances")
	}

	return nil
}

func newLogGroup(ctx *pulumi.Context, name string, opts ...pulumi.ResourceOption) (*cloudwatch.LogGroup, error) {
	lg, err := cloudwatch.NewLogGroup(ctx, getCommonName(name, "search-log-group"), &cloudwatch.LogGroupArgs{}, opts...)
	if err != nil {
		return nil, err
	}

	doc := lg.Arn.ApplyT(func(arn string) string {
		return `{
			"Version": "2012-10-17",
			"Statement": [{
				"Effect": "Allow",
				"Principal": {
					"Service": "es.amazonaws.com"
				},
				"Action": [
					"logs:PutLogEvents",
					"logs:PutLogEventsBatch",
					"logs:CreateLogStream"
				],
				"Resource": "arn:aws:logs:*"
			}]
		}`
	}).(pulumi.StringOutput)

	_, err = cloudwatch.NewLogResourcePolicy(ctx, getCommonName(name, "search-log-policy"), &cloudwatch.LogResourcePolicyArgs{
		PolicyName:     pulumi.String(getCommonName(name, "search-log-policy")),
		PolicyDocument: doc,
	}, opts...)

	if err != nil {
		return nil, err
	}

	return lg, nil
}

type Opensearch struct {
	pulumi.ResourceState

	Domain   pulumi.StringOutput
	Endpoint pulumi.StringOutput
	Password pulumi.StringOutput
	User     pulumi.StringOutput
}
