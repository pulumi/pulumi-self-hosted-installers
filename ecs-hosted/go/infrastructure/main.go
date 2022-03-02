package main

import (
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/ec2"
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
					CidrBlocks: pulumi.StringArray{pulumi.String("0.0.0.0/0")},
				},
			},
		})

		if err != nil {
			return err
		}

		_, err = ec2.NewVpcEndpoint(ctx, getCommonName(name, "s3-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:       pulumi.String(config.vpcId),
			ServiceName: pulumi.String(fmt.Sprintf("com.amazonaws.%s.s3", config.region)),
		})

		if err != nil {
			return err
		}

		_, err = ec2.NewVpcEndpoint(ctx, getCommonName(name, "ecr-dkr-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:             pulumi.String(config.vpcId),
			ServiceName:       pulumi.String(fmt.Sprintf("com.amazonaws.%s.ecr.dkr", config.region)),
			VpcEndpointType:   pulumi.String("Interface"),
			PrivateDnsEnabled: pulumi.BoolPtr(false),
			SecurityGroupIds:  pulumi.StringArray{endpointSecurityGroup.ID()},
		})

		if err != nil {
			return err
		}

		_, err = ec2.NewVpcEndpoint(ctx, getCommonName(name, "ecr-api-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:             pulumi.String(config.vpcId),
			ServiceName:       pulumi.String(fmt.Sprintf("com.amazonaws.%s.ecr.api", config.region)),
			VpcEndpointType:   pulumi.String("Interface"),
			PrivateDnsEnabled: pulumi.BoolPtr(false),
			SecurityGroupIds:  pulumi.StringArray{endpointSecurityGroup.ID()},
		})

		if err != nil {
			return err
		}

		_, err = ec2.NewVpcEndpoint(ctx, getCommonName(name, "secrets-manager-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:             pulumi.String(config.vpcId),
			ServiceName:       pulumi.String(fmt.Sprintf("com.amazonaws.%s.secretsmanager", config.region)),
			VpcEndpointType:   pulumi.String("Interface"),
			PrivateDnsEnabled: pulumi.BoolPtr(false),
			SecurityGroupIds:  pulumi.StringArray{endpointSecurityGroup.ID()},
		})

		if err != nil {
			return err
		}

		_, err = ec2.NewVpcEndpoint(ctx, getCommonName(name, "cloudwatch-endpoint"), &ec2.VpcEndpointArgs{
			VpcId:             pulumi.String(config.vpcId),
			ServiceName:       pulumi.String(fmt.Sprintf("com.amazonaws.%s.logs", config.region)),
			VpcEndpointType:   pulumi.String("Interface"),
			PrivateDnsEnabled: pulumi.BoolPtr(false),
			SecurityGroupIds:  pulumi.StringArray{endpointSecurityGroup.ID()},
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

		return nil
	})
}
