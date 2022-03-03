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
	awsConfig := config.New(ctx, "aws")

	resource.Region = awsConfig.Require("region")
	resource.Profile = awsConfig.Get("profile")

	resource.ProjectName = ctx.Project()
	resource.StackName = ctx.Stack()

	stackRef, err := pulumi.NewStackReference(ctx, appConfig.Require("appStackReference"), nil)
	if err != nil {
		return nil, err
	}

	resource.Route53ZoneName = stackRef.GetStringOutput(pulumi.String("route53ZoneName"))
	resource.Route53Subdomain = stackRef.GetStringOutput(pulumi.String("route53Subdomain"))
	resource.ApiLoadBalancerDnsName = stackRef.GetStringOutput(pulumi.String("apiLoadBalancerDnsName"))
	resource.ApiLoadBalancerZoneId = stackRef.GetStringOutput(pulumi.String("apiLoadBalancerZoneId"))
	resource.ConsoleLoadBalancerDnsName = stackRef.GetStringOutput(pulumi.String("consoleLoadBalancerDnsName"))
	resource.ConsoleLoadBalancerZoneId = stackRef.GetStringOutput(pulumi.String("consoleLoadBalancerZoneId"))

	return &resource, nil
}

type ConfigArgs struct {
	Region                     string
	Profile                    string
	AccountId                  string
	ProjectName                string
	StackName                  string
	Route53ZoneName            pulumi.StringOutput
	Route53Subdomain           pulumi.StringOutput
	ApiLoadBalancerDnsName     pulumi.StringOutput
	ApiLoadBalancerZoneId      pulumi.StringOutput
	ConsoleLoadBalancerDnsName pulumi.StringOutput
	ConsoleLoadBalancerZoneId  pulumi.StringOutput
}
