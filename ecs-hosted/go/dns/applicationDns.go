package main

import (
	"fmt"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/route53"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"strings"
)

func NewApplicationDns(ctx *pulumi.Context, name string, args *ApplicationDnsArgs, opts ...pulumi.ResourceOption) (*ApplicationDns, error) {
	var resource ApplicationDns

	err := ctx.RegisterComponentResource("pulumi:applicationDns", name, &resource, opts...)
	if err != nil {
		return nil, err
	}

	// create our parented options
	options := append(opts, pulumi.Parent(&resource))

	zone := route53.LookupZoneOutput(ctx, route53.LookupZoneOutputArgs{
		Name: args.ZoneName,
	})

	if err != nil {
		return nil, err
	}

	apiName := args.Domain.ApplyT(func(s string) string {
		return strings.Join([]string{"api", s}, ".")
	}).(pulumi.StringOutput)

	resource.ApiRecord, err = route53.NewRecord(ctx, fmt.Sprintf("%s-api-record", name), &route53.RecordArgs{
		ZoneId: zone.Id(),
		Name:   apiName,
		Type:   pulumi.String("A"),
		Aliases: &route53.RecordAliasArray{
			route53.RecordAliasArgs{
				Name:                 args.ApiLoadBalancerDnsName,
				ZoneId:               args.ApiLoadBalancerZoneId,
				EvaluateTargetHealth: pulumi.Bool(true),
			},
		},
	}, options...)

	if err != nil {
		return nil, err
	}

	appName := args.Domain.ApplyT(func(s string) string {
		return strings.Join([]string{"app", s}, ".")
	}).(pulumi.StringOutput)

	resource.ConsoleRecord, err = route53.NewRecord(ctx, fmt.Sprintf("%s-console-record", name), &route53.RecordArgs{
		ZoneId: zone.Id(),
		Name:   appName,
		Type:   pulumi.String("A"),
		Aliases: &route53.RecordAliasArray{
			route53.RecordAliasArgs{
				Name:                 args.ConsoleLoadBalancerDnsName,
				ZoneId:               args.ConsoleLoadBalancerZoneId,
				EvaluateTargetHealth: pulumi.Bool(true),
			},
		},
	}, options...)

	if err != nil {
		return nil, err
	}

	return &resource, nil
}

type ApplicationDnsArgs struct {
	Region                     string
	Domain                     pulumi.StringOutput
	ZoneName                   pulumi.StringOutput
	ApiLoadBalancerDnsName     pulumi.StringOutput
	ApiLoadBalancerZoneId      pulumi.StringOutput
	ConsoleLoadBalancerDnsName pulumi.StringOutput
	ConsoleLoadBalancerZoneId  pulumi.StringOutput
}

type ApplicationDns struct {
	pulumi.ResourceState

	ApiRecord     *route53.Record
	ConsoleRecord *route53.Record
}
