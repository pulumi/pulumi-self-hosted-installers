package main

import (
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/ec2"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		// Create a VPC for testing ECS infrastructure
		vpc, err := ec2.NewVpc(ctx, "test-vpc", &ec2.VpcArgs{
			CidrBlock:          pulumi.String("10.0.0.0/16"),
			EnableDnsSupport:   pulumi.Bool(true),
			EnableDnsHostnames: pulumi.Bool(true),
			Tags: pulumi.StringMap{
				"Name": pulumi.String("test-vpc"),
			},
		})
		if err != nil {
			return err
		}

		// Get availability zones
		azs, err := aws.GetAvailabilityZones(ctx, &aws.GetAvailabilityZonesArgs{
			State: pulumi.StringRef("available"),
		})
		if err != nil {
			return err
		}

		// Create public subnets
		publicSubnet1, err := ec2.NewSubnet(ctx, "public-subnet-1", &ec2.SubnetArgs{
			VpcId:               vpc.ID(),
			CidrBlock:           pulumi.String("10.0.1.0/24"),
			AvailabilityZone:    pulumi.String(azs.Names[0]),
			MapPublicIpOnLaunch: pulumi.Bool(true),
			Tags: pulumi.StringMap{
				"Name": pulumi.String("public-subnet-1"),
				"Type": pulumi.String("public"),
			},
		})
		if err != nil {
			return err
		}

		publicSubnet2, err := ec2.NewSubnet(ctx, "public-subnet-2", &ec2.SubnetArgs{
			VpcId:               vpc.ID(),
			CidrBlock:           pulumi.String("10.0.2.0/24"),
			AvailabilityZone:    pulumi.String(azs.Names[1]),
			MapPublicIpOnLaunch: pulumi.Bool(true),
			Tags: pulumi.StringMap{
				"Name": pulumi.String("public-subnet-2"),
				"Type": pulumi.String("public"),
			},
		})
		if err != nil {
			return err
		}

		// Create private subnets
		privateSubnet1, err := ec2.NewSubnet(ctx, "private-subnet-1", &ec2.SubnetArgs{
			VpcId:            vpc.ID(),
			CidrBlock:        pulumi.String("10.0.3.0/24"),
			AvailabilityZone: pulumi.String(azs.Names[0]),
			Tags: pulumi.StringMap{
				"Name": pulumi.String("private-subnet-1"),
				"Type": pulumi.String("private"),
			},
		})
		if err != nil {
			return err
		}

		privateSubnet2, err := ec2.NewSubnet(ctx, "private-subnet-2", &ec2.SubnetArgs{
			VpcId:            vpc.ID(),
			CidrBlock:        pulumi.String("10.0.4.0/24"),
			AvailabilityZone: pulumi.String(azs.Names[1]),
			Tags: pulumi.StringMap{
				"Name": pulumi.String("private-subnet-2"),
				"Type": pulumi.String("private"),
			},
		})
		if err != nil {
			return err
		}

		// Create isolated subnets
		isolatedSubnet1, err := ec2.NewSubnet(ctx, "isolated-subnet-1", &ec2.SubnetArgs{
			VpcId:            vpc.ID(),
			CidrBlock:        pulumi.String("10.0.5.0/24"),
			AvailabilityZone: pulumi.String(azs.Names[0]),
			Tags: pulumi.StringMap{
				"Name": pulumi.String("isolated-subnet-1"),
				"Type": pulumi.String("isolated"),
			},
		})
		if err != nil {
			return err
		}

		isolatedSubnet2, err := ec2.NewSubnet(ctx, "isolated-subnet-2", &ec2.SubnetArgs{
			VpcId:            vpc.ID(),
			CidrBlock:        pulumi.String("10.0.6.0/24"),
			AvailabilityZone: pulumi.String(azs.Names[1]),
			Tags: pulumi.StringMap{
				"Name": pulumi.String("isolated-subnet-2"),
				"Type": pulumi.String("isolated"),
			},
		})
		if err != nil {
			return err
		}

		// Create internet gateway and route table for public subnets
		igw, err := ec2.NewInternetGateway(ctx, "igw", &ec2.InternetGatewayArgs{
			VpcId: vpc.ID(),
			Tags: pulumi.StringMap{
				"Name": pulumi.String("igw"),
			},
		})
		if err != nil {
			return err
		}

		publicRouteTable, err := ec2.NewRouteTable(ctx, "public-rt", &ec2.RouteTableArgs{
			VpcId: vpc.ID(),
			Routes: ec2.RouteTableRouteArray{
				&ec2.RouteTableRouteArgs{
					CidrBlock: pulumi.String("0.0.0.0/0"),
					GatewayId: igw.ID(),
				},
			},
			Tags: pulumi.StringMap{
				"Name": pulumi.String("public-rt"),
			},
		})
		if err != nil {
			return err
		}

		// Associate public subnets with route table
		_, err = ec2.NewRouteTableAssociation(ctx, "public-rt-assoc-1", &ec2.RouteTableAssociationArgs{
			SubnetId:     publicSubnet1.ID(),
			RouteTableId: publicRouteTable.ID(),
		})
		if err != nil {
			return err
		}

		_, err = ec2.NewRouteTableAssociation(ctx, "public-rt-assoc-2", &ec2.RouteTableAssociationArgs{
			SubnetId:     publicSubnet2.ID(),
			RouteTableId: publicRouteTable.ID(),
		})
		if err != nil {
			return err
		}

		// Create NAT Gateway for private subnets
		eip, err := ec2.NewEip(ctx, "nat-eip", &ec2.EipArgs{
			Domain: pulumi.String("vpc"),
			Tags: pulumi.StringMap{
				"Name": pulumi.String("nat-eip"),
			},
		})
		if err != nil {
			return err
		}

		natGateway, err := ec2.NewNatGateway(ctx, "nat-gw", &ec2.NatGatewayArgs{
			AllocationId: eip.ID(),
			SubnetId:     publicSubnet1.ID(),
			Tags: pulumi.StringMap{
				"Name": pulumi.String("nat-gw"),
			},
		})
		if err != nil {
			return err
		}

		privateRouteTable, err := ec2.NewRouteTable(ctx, "private-rt", &ec2.RouteTableArgs{
			VpcId: vpc.ID(),
			Routes: ec2.RouteTableRouteArray{
				&ec2.RouteTableRouteArgs{
					CidrBlock:    pulumi.String("0.0.0.0/0"),
					NatGatewayId: natGateway.ID(),
				},
			},
			Tags: pulumi.StringMap{
				"Name": pulumi.String("private-rt"),
			},
		})
		if err != nil {
			return err
		}

		// Associate private subnets with route table
		_, err = ec2.NewRouteTableAssociation(ctx, "private-rt-assoc-1", &ec2.RouteTableAssociationArgs{
			SubnetId:     privateSubnet1.ID(),
			RouteTableId: privateRouteTable.ID(),
		})
		if err != nil {
			return err
		}

		_, err = ec2.NewRouteTableAssociation(ctx, "private-rt-assoc-2", &ec2.RouteTableAssociationArgs{
			SubnetId:     privateSubnet2.ID(),
			RouteTableId: privateRouteTable.ID(),
		})
		if err != nil {
			return err
		}

		// Export the VPC and subnet IDs for the infrastructure stage
		ctx.Export("vpcId", vpc.ID())
		ctx.Export("publicSubnetIds", pulumi.StringArray{publicSubnet1.ID(), publicSubnet2.ID()})
		ctx.Export("privateSubnetIds", pulumi.StringArray{privateSubnet1.ID(), privateSubnet2.ID()})
		ctx.Export("isolatedSubnetIds", pulumi.StringArray{isolatedSubnet1.ID(), isolatedSubnet2.ID()})

		return nil
	})
}
