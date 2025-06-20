package main

import (
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/ec2"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/infrastructure/common"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func getCommonName(first string, second string) string {
	return fmt.Sprintf("%s-%s", first, second)
}

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {

		config, err := NewConfig(ctx)
		if err != nil {
			return err
		}

		// retrieve VPC to populate the CIDR block of the VPCE SG ingress
		vpc, err := ec2.LookupVpc(ctx, &ec2.LookupVpcArgs{
			Id: &config.VpcId,
		})

		if err != nil {
			return err
		}

		name := config.CommonName

		database, err := NewDatabase(ctx, getCommonName(name, "database"), &DatabaseArgs{
			vpcId:             pulumi.String(config.VpcId),
			isolatedSubnetIds: pulumi.ToStringArray(config.IsolatedSubnetIds),
			numberDbReplicas:  config.NumberDbReplicas,
			instanceType:      pulumi.String(config.DbInstanceType),
			region:            config.Region,
		})

		if err != nil {
			return err
		}

		endpointSecurityGroup, err := ec2.NewSecurityGroup(ctx, getCommonName(name, "endpoint-sg"), &ec2.SecurityGroupArgs{
			VpcId: pulumi.String(config.VpcId),
			Ingress: ec2.SecurityGroupIngressArray{
				ec2.SecurityGroupIngressArgs{
					Protocol:   pulumi.String("-1"),
					FromPort:   pulumi.Int(0),
					ToPort:     pulumi.Int(0),
					CidrBlocks: pulumi.StringArray{pulumi.String(vpc.CidrBlock)},
				},
			},
		})

		if err != nil {
			return err
		}

		s3ServiceName := common.GetEnpointAddress(config.Region, fmt.Sprintf("com.amazonaws.%s.s3", config.Region))
		s3Endpoint, err := ec2.NewVpcEndpoint(ctx, getCommonName(name, "s3-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:       pulumi.String(config.VpcId),
			ServiceName: pulumi.String(s3ServiceName),
		})

		if err != nil {
			return err
		}

		privateS3PrefixList := ec2.GetPrefixListOutput(ctx, ec2.GetPrefixListOutputArgs{
			PrefixListId: s3Endpoint.PrefixListId,
		}, nil)

		dkrServiceName := common.GetEnpointAddress(config.Region, fmt.Sprintf("com.amazonaws.%s.ecr.dkr", config.Region))
		_, err = ec2.NewVpcEndpoint(ctx, getCommonName(name, "ecr-dkr-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:             pulumi.String(config.VpcId),
			ServiceName:       pulumi.String(dkrServiceName),
			VpcEndpointType:   pulumi.String("Interface"),
			PrivateDnsEnabled: pulumi.BoolPtr(true),
			SecurityGroupIds:  pulumi.StringArray{endpointSecurityGroup.ID()},
			SubnetIds:         pulumi.ToStringArray(config.PrivateSubnetIds),
		})

		if err != nil {
			return err
		}

		ecrServiceName := common.GetEnpointAddress(config.Region, fmt.Sprintf("com.amazonaws.%s.ecr.api", config.Region))
		_, err = ec2.NewVpcEndpoint(ctx, getCommonName(name, "ecr-api-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:             pulumi.String(config.VpcId),
			ServiceName:       pulumi.String(ecrServiceName),
			VpcEndpointType:   pulumi.String("Interface"),
			PrivateDnsEnabled: pulumi.BoolPtr(true),
			SecurityGroupIds:  pulumi.StringArray{endpointSecurityGroup.ID()},
			SubnetIds:         pulumi.ToStringArray(config.PrivateSubnetIds),
		})

		if err != nil {
			return err
		}

		smServiceName := common.GetEnpointAddress(config.Region, fmt.Sprintf("com.amazonaws.%s.secretsmanager", config.Region))
		_, err = ec2.NewVpcEndpoint(ctx, getCommonName(name, "secrets-manager-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:             pulumi.String(config.VpcId),
			ServiceName:       pulumi.String(smServiceName),
			VpcEndpointType:   pulumi.String("Interface"),
			PrivateDnsEnabled: pulumi.BoolPtr(true),
			SecurityGroupIds:  pulumi.StringArray{endpointSecurityGroup.ID()},
			SubnetIds:         pulumi.ToStringArray(config.PrivateSubnetIds),
		})

		if err != nil {
			return err
		}

		cwServiceName := common.GetEnpointAddress(config.Region, fmt.Sprintf("com.amazonaws.%s.logs", config.Region))
		_, err = ec2.NewVpcEndpoint(ctx, getCommonName(name, "cloudwatch-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:             pulumi.String(config.VpcId),
			ServiceName:       pulumi.String(cwServiceName),
			VpcEndpointType:   pulumi.String("Interface"),
			PrivateDnsEnabled: pulumi.BoolPtr(true),
			SecurityGroupIds:  pulumi.StringArray{endpointSecurityGroup.ID()},
			SubnetIds:         pulumi.ToStringArray(config.PrivateSubnetIds),
		})

		if err != nil {
			return err
		}

		elbServicName := common.GetEnpointAddress(config.Region, fmt.Sprintf("com.amazonaws.%s.elasticloadbalancing", config.Region))
		_, err = ec2.NewVpcEndpoint(ctx, getCommonName(name, "elb-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:             pulumi.String(config.VpcId),
			ServiceName:       pulumi.String(elbServicName),
			VpcEndpointType:   pulumi.String("Interface"),
			PrivateDnsEnabled: pulumi.BoolPtr(true),
			SecurityGroupIds:  pulumi.StringArray{endpointSecurityGroup.ID()},
			SubnetIds:         pulumi.ToStringArray(config.PrivateSubnetIds),
		})

		if err != nil {
			return err
		}

		OpenSearchArgs := &OpenSearchArgs{
			DeployOpenSearch:     config.EnableOpenSearch,
			InstanceType:         config.OpenSearchInstanceType,
			InstanceCount:        config.OpenSearchInstanceCount,
			DomainName:           config.OpenSearchDomainName,
			DedicatedMasterCount: config.OpenSearchDedicatedMasterCount,
			VpcId:                config.VpcId,
			SubnetIds:            config.PrivateSubnetIds,
			AccountId:            config.AccountId,
			Region:               config.Region,
		}

		OpenSearchDomain, err := NewOpenSearch(ctx, getCommonName(name, "opensearch"), OpenSearchArgs)
		if err != nil {
			return err
		}

		ctx.Export("vpcId", pulumi.String(config.VpcId))
		ctx.Export("publicSubnetIds", pulumi.ToStringArray(config.PublicSubnetIds))
		ctx.Export("privateSubnetIds", pulumi.ToStringArray(config.PrivateSubnetIds))
		ctx.Export("isolatedSubnetIds", pulumi.ToStringArray(config.IsolatedSubnetIds))
		ctx.Export("dbClusterEndpoint", database.dbClusterEndpoint)
		ctx.Export("dbPort", database.dbPort)
		ctx.Export("dbName", database.dbName)
		ctx.Export("dbUsername", database.dbUsername)
		ctx.Export("dbPassword", pulumi.ToSecret(database.dbPassword))
		ctx.Export("dbSecurityGroupId", database.dbSecurityGroupId)
		ctx.Export("endpointSecurityGroupId", endpointSecurityGroup.ID())
		ctx.Export("s3EndpointPrefixId", privateS3PrefixList.Id())
		ctx.Export("opensearchDomainName", OpenSearchDomain.DomainName)
		ctx.Export("opensearchEndpoint", OpenSearchDomain.Endpoint)
		ctx.Export("opensearchUser", OpenSearchDomain.User)
		ctx.Export("opensearchPassword", OpenSearchDomain.Password)

		return nil
	})
}
