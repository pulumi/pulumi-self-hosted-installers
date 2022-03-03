package main

import (
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/dns/config"
	"strings"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {

		cfg, err := config.NewConfig(ctx)
		if err != nil {
			return err
		}

		domain := pulumi.All(cfg.Route53ZoneName, cfg.Route53Subdomain).ApplyT(func(args []interface{}) string {
			zone := args[0].(string)
			sub := args[1].(string)

			if sub != "" {
				return strings.Join([]string{sub, zone}, ".")
			} else {
				return zone
			}
		}).(pulumi.StringOutput)

		dnsRecords, err := NewApplicationDns(ctx, "dns", &ApplicationDnsArgs{
			Domain:                     domain,
			Region:                     cfg.Region,
			ZoneName:                   cfg.Route53ZoneName,
			ApiLoadBalancerDnsName:     cfg.ApiLoadBalancerDnsName,
			ApiLoadBalancerZoneId:      cfg.ApiLoadBalancerZoneId,
			ConsoleLoadBalancerDnsName: cfg.ConsoleLoadBalancerDnsName,
			ConsoleLoadBalancerZoneId:  cfg.ConsoleLoadBalancerZoneId,
		})

		if err != nil {
			return err
		}

		ctx.Export("apiUrl", dnsRecords.ApiRecord.Fqdn)
		ctx.Export("consoleUrl", dnsRecords.ConsoleRecord.Fqdn)

		return nil
	})
}
