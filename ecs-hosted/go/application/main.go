package main

import (
	"strings"

	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/s3"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/application/config"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/application/log"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/application/network"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/application/service"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {

		config, err := config.NewConfig(ctx)
		if err != nil {
			return err
		}

		// Create an AWS resource (S3 Bucket)
		checkpointsBucket, err := s3.NewBucket(ctx, "pulumi-checkpoints", &s3.BucketArgs{}, pulumi.Protect(true))
		if err != nil {
			return err
		}

		policypackBucket, err := s3.NewBucket(ctx, "pulumi-policypacks", &s3.BucketArgs{}, pulumi.Protect(true))
		if err != nil {
			return err
		}

		trafficManager, err := network.NewTrafficManager(ctx, "pulumi-tm", &network.LoadBalancerArgs{
			AccountId:           config.AccountId,
			CertificateArn:      config.AcmCertificateArn,
			PublicSubnetIds:     config.PublicSubnetIds,
			Region:              config.Region,
			VpcId:               config.VpcId,
			WhiteListCidrBlocks: config.WhiteListCidrBlocks,
			IdleTimeout:         120,
			InternalLb:          false,
		})

		secretsPrefix := strings.Join([]string{config.ProjectName, config.StackName}, "/")
		apiUrl := strings.Join([]string{"api", config.Route53Subdomain, config.Route53ZoneName}, ".")
		consoleUrl := strings.Join([]string{"app", config.Route53Subdomain, config.Route53ZoneName}, ".")
		domain := config.Route53ZoneName

		if config.Route53Subdomain == "" {
			ctx.Log.Debug("no subdomain present. Route53 zone name will be base of application URLs", nil)
			apiUrl = strings.Join([]string{"api", config.Route53ZoneName}, ".")
			consoleUrl = strings.Join([]string{"app", config.Route53ZoneName}, ".")
		}

		if err != nil {
			return err
		}

		baseArgs := &service.ContainerBaseArgs{
			AccountId:            config.AccountId,
			Profile:              config.Profile,
			KmsServiceKeyId:      config.KmsServiceKeyId,
			PrivateSubnetIds:     config.PrivateSubnetIds,
			Region:               config.Region,
			SecretsManagerPrefix: secretsPrefix,
			VpcId:                config.VpcId,
		}

		apiLogs := log.NewLogs(ctx, config.LogType, "api", config.Region, config.LogArgs)

		_, err = service.NewApiContainerService(ctx, "pulumi-service-api", &service.ApiContainerServiceArgs{
			ContainerBaseArgs:          *baseArgs,
			ContainerCpu:               config.ApiContainerCpu,
			ContainerMemoryReservation: config.ApiContainerMemoryReservation,
			ApiUrl:                     apiUrl,
			ConsoleUrl:                 consoleUrl,
			EcrRepoAccountId:           config.EcrRepoAccountId,
			ImageTag:                   config.ImageTag,
			LicenseKey:                 config.LicenseKey,
			RecaptchaSecretKey:         config.RecaptchaSecretKey,
			SamlArgs:                   config.SamlArgs,
			TaskMemory:                 config.ApiTaskMemory,
			TaskCpu:                    config.ApiTaskCpu,
			TrafficManager:             trafficManager,
			DesiredNumberTasks:         config.ApiDesiredNumberTasks,
			DisableEmailSignup:         config.ApiDisableEmailSign,
			DisableEmailLogin:          config.ApiDisableEmailLogin,
			DatabaseArgs:               config.DatabaseArgs,
			SmtpArgs:                   config.SmtpArgs,
			RootDomain:                 domain,
			WhiteListCidrBlocks:        config.WhiteListCidrBlocks,
			CheckPointbucket:           checkpointsBucket,
			PolicyPacksBucket:          policypackBucket,
			LogDriver:                  apiLogs,
		})

		if err != nil {
			return err
		}

		consoleLogs := log.NewLogs(ctx, config.LogType, "service-ui", config.Region, config.LogArgs)

		_, err = service.NewConsoleContainerService(ctx, "pulumi-service-ui", &service.ConsoleContainerServiceArgs{
			ContainerBaseArgs:          *baseArgs,
			ContainerCpu:               config.ConsoleContainerCpu,
			ContainerMemoryReservation: config.ConsoleContainerMemoryReservation,
			EcrRepoAccountId:           config.EcrRepoAccountId,
			ImageTag:                   config.ImageTag,
			RecaptchaSiteKey:           config.RecaptchaSiteKey,
			DesiredNumberTasks:         config.ConsoleDesiredNumberTasks,
			SamlSsoEnabled:             config.SamlArgs != nil,
			TaskMemory:                 config.ConsoleTaskMemory,
			TaskCpu:                    config.ConsoleTaskCpu,
			TrafficManager:             trafficManager,
			HideEmailSignup:            config.ConsoleHideEmailSignup,
			HideEmailLogin:             config.ConsoleHideEmailLogin,
			ConsoleUrl:                 consoleUrl,
			ApiUrl:                     apiUrl,
			RootDomain:                 domain,
			WhiteListCidrBlocks:        config.WhiteListCidrBlocks,
			LogDriver:                  consoleLogs,
		})

		if err != nil {
			return err
		}

		ctx.Export("checkpointsS3BucketName", checkpointsBucket.Bucket)
		ctx.Export("policyPacksS3BucketName", policypackBucket.Bucket)
		ctx.Export("apiLoadBalancerDnsName", trafficManager.Api.LoadBalancer.DnsName)
		ctx.Export("apiLoadBalancerZoneId", trafficManager.Api.LoadBalancer.ZoneId)
		ctx.Export("consoleLoadBalancerDnsName", trafficManager.Console.LoadBalancer.DnsName)
		ctx.Export("consoleLoadBalancerZoneId", trafficManager.Console.LoadBalancer.ZoneId)
		ctx.Export("route53ZoneName", pulumi.String(config.Route53ZoneName))
		ctx.Export("route53Subdomain", pulumi.String(config.Route53Subdomain))

		return nil
	})
}
