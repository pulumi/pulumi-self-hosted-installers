package main

import (
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/ec2"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/common"
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
			Id: &config.vpcId,
		})

		if err != nil {
			return err
		}

		name := config.commonName

		database, err := NewDatabase(ctx, getCommonName(name, "database"), &DatabaseArgs{
			vpcId:             pulumi.String(config.vpcId),
			isolatedSubnetIds: pulumi.ToStringArray(config.isolatedSubnetIds),
			numberDbReplicas:  config.numberDbReplicas,
			instanceType:      pulumi.String(config.dbInstanceType),
			region:            config.region,
		})

		if err != nil {
			return err
		}

		endpointSecurityGroup, err := ec2.NewSecurityGroup(ctx, getCommonName(name, "endpoint-sg"), &ec2.SecurityGroupArgs{
			VpcId: pulumi.String(config.vpcId),
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

		s3ServiceName := common.GetEnpointAddress(config.region, fmt.Sprintf("com.amazonaws.%s.s3", config.region))
		s3Endpoint, err := ec2.NewVpcEndpoint(ctx, getCommonName(name, "s3-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:       pulumi.String(config.vpcId),
			ServiceName: pulumi.String(s3ServiceName),
		})

		if err != nil {
			return err
		}

		privateS3PrefixList := ec2.GetPrefixListOutput(ctx, ec2.GetPrefixListOutputArgs{
			PrefixListId: s3Endpoint.PrefixListId,
		}, nil)

		dkrServiceName := common.GetEnpointAddress(config.region, fmt.Sprintf("com.amazonaws.%s.ecr.dkr", config.region))
		_, err = ec2.NewVpcEndpoint(ctx, getCommonName(name, "ecr-dkr-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:             pulumi.String(config.vpcId),
			ServiceName:       pulumi.String(dkrServiceName),
			VpcEndpointType:   pulumi.String("Interface"),
			PrivateDnsEnabled: pulumi.BoolPtr(true),
			SecurityGroupIds:  pulumi.StringArray{endpointSecurityGroup.ID()},
			SubnetIds:         pulumi.ToStringArray(config.privateSubnetIds),
		})

		if err != nil {
			return err
		}

		ecrServiceName := common.GetEnpointAddress(config.region, fmt.Sprintf("com.amazonaws.%s.ecr.api", config.region))
		_, err = ec2.NewVpcEndpoint(ctx, getCommonName(name, "ecr-api-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:             pulumi.String(config.vpcId),
			ServiceName:       pulumi.String(ecrServiceName),
			VpcEndpointType:   pulumi.String("Interface"),
			PrivateDnsEnabled: pulumi.BoolPtr(true),
			SecurityGroupIds:  pulumi.StringArray{endpointSecurityGroup.ID()},
			SubnetIds:         pulumi.ToStringArray(config.privateSubnetIds),
		})

		if err != nil {
			return err
		}

		smServiceName := common.GetEnpointAddress(config.region, fmt.Sprintf("com.amazonaws.%s.secretsmanager", config.region))
		_, err = ec2.NewVpcEndpoint(ctx, getCommonName(name, "secrets-manager-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:             pulumi.String(config.vpcId),
			ServiceName:       pulumi.String(smServiceName),
			VpcEndpointType:   pulumi.String("Interface"),
			PrivateDnsEnabled: pulumi.BoolPtr(true),
			SecurityGroupIds:  pulumi.StringArray{endpointSecurityGroup.ID()},
			SubnetIds:         pulumi.ToStringArray(config.privateSubnetIds),
		})

		if err != nil {
			return err
		}

		cwServiceName := common.GetEnpointAddress(config.region, fmt.Sprintf("com.amazonaws.%s.logs", config.region))
		_, err = ec2.NewVpcEndpoint(ctx, getCommonName(name, "cloudwatch-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:             pulumi.String(config.vpcId),
			ServiceName:       pulumi.String(cwServiceName),
			VpcEndpointType:   pulumi.String("Interface"),
			PrivateDnsEnabled: pulumi.BoolPtr(true),
			SecurityGroupIds:  pulumi.StringArray{endpointSecurityGroup.ID()},
			SubnetIds:         pulumi.ToStringArray(config.privateSubnetIds),
		})

		if err != nil {
			return err
		}

		elbServicName := common.GetEnpointAddress(config.region, fmt.Sprintf("com.amazonaws.%s.elasticloadbalancing", config.region))
		_, err = ec2.NewVpcEndpoint(ctx, getCommonName(name, "elb-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:             pulumi.String(config.vpcId),
			ServiceName:       pulumi.String(elbServicName),
			VpcEndpointType:   pulumi.String("Interface"),
			PrivateDnsEnabled: pulumi.BoolPtr(true),
			SecurityGroupIds:  pulumi.StringArray{endpointSecurityGroup.ID()},
			SubnetIds:         pulumi.ToStringArray(config.privateSubnetIds),
		})

		if err != nil {
			return err
		}

		ctx.Export("vpcId", pulumi.String(config.vpcId))
		ctx.Export("publicSubnetIds", pulumi.ToStringArray(config.publicSubnetIds))
		ctx.Export("privateSubnetIds", pulumi.ToStringArray(config.privateSubnetIds))
		ctx.Export("isolatedSubnetIds", pulumi.ToStringArray(config.isolatedSubnetIds))
		ctx.Export("dbClusterEndpoint", database.dbClusterEndpoint)
		ctx.Export("dbPort", database.dbPort)
		ctx.Export("dbName", database.dbName)
		ctx.Export("dbUsername", database.dbUsername)
		ctx.Export("dbPassword", pulumi.ToSecret(database.dbPassword))
		ctx.Export("dbSecurityGroupId", database.dbSecurityGroupId)
		ctx.Export("endpointSecurityGroupId", endpointSecurityGroup.ID())
		ctx.Export("s3EndpointPrefixId", privateS3PrefixList.Id())

		return nil
	})
}
