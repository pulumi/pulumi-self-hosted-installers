package config

import (
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

func NewConfig(ctx *pulumi.Context) (*ConfigArgs, error) {
	var resource ConfigArgs

	caller, err := aws.GetCallerIdentity(ctx, nil, nil)
	if err != nil {
		return nil, err
	}

	// aws account id we are current deploying to
	resource.AccountId = caller.AccountId

	appConfig := config.New(ctx, "")
	resource.EnablePrivateLoadBalancerAndLimitEgress = appConfig.GetBool("enablePrivateLoadBalancerAndLimitEgress")

	awsConfig := config.New(ctx, "aws")

	resource.Region = awsConfig.Require("region")
	resource.Profile = awsConfig.Get("profile")

	resource.ProjectName = ctx.Project()
	resource.StackName = ctx.Stack()

	stackRef, err := pulumi.NewStackReference(ctx, appConfig.Require("appStackReference"), nil)
	if err != nil {
		return nil, err
	}

	// TODO: how can we create logic to determine whether internal load balancer is present without using apply?

	resource.Route53ZoneName = stackRef.GetStringOutput(pulumi.String("route53ZoneName"))
	resource.Route53Subdomain = stackRef.GetStringOutput(pulumi.String("route53Subdomain"))
	resource.PublicLoadBalancerDnsName = stackRef.GetStringOutput(pulumi.String("publicLoadBalancerDnsName"))
	resource.PublicLoadBalancerZoneId = stackRef.GetStringOutput(pulumi.String("publicLoadBalancerZoneId"))
	resource.InternalLoadBalancerDnsName = stackRef.GetStringOutput(pulumi.String("internalLoadBalancerDnsName"))
	resource.InternalLoadBalancerZoneId = stackRef.GetStringOutput(pulumi.String("internalLoadBalancerZoneId"))

	return &resource, nil
}

type ConfigArgs struct {
	Region                                  string
	Profile                                 string
	AccountId                               string
	ProjectName                             string
	StackName                               string
	EnablePrivateLoadBalancerAndLimitEgress bool
	Route53ZoneName                         pulumi.StringOutput
	Route53Subdomain                        pulumi.StringOutput
	PublicLoadBalancerDnsName               pulumi.StringOutput
	PublicLoadBalancerZoneId                pulumi.StringOutput
	InternalLoadBalancerDnsName             pulumi.StringOutput
	InternalLoadBalancerZoneId              pulumi.StringOutput
}
