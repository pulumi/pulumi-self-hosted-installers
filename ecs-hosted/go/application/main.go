package main

import (
	"strings"

	"application/config"
	"application/log"
	"application/network"
	"application/service"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/ec2"
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/s3"
	"github.com/pulumi/pulumi-tls/sdk/v5/go/tls"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {

		config, err := config.NewConfig(ctx)
		if err != nil {
			return err
		}

		// Pulumi uses 2 s3 buckets; checkpoints and policypacks
		checkpointsBucketOpts := []pulumi.ResourceOption{}
		if config.ProtectResources {
			checkpointsBucketOpts = append(checkpointsBucketOpts, pulumi.Protect(true))
		}
		checkpointsBucket, err := s3.NewBucket(ctx, "pulumi-checkpoints", &s3.BucketArgs{
			// Versioning: enabled by default in newer AWS provider
		}, checkpointsBucketOpts...)

		if err != nil {
			return err
		}

		policypackBucketOpts := []pulumi.ResourceOption{}
		if config.ProtectResources {
			policypackBucketOpts = append(policypackBucketOpts, pulumi.Protect(true))
		}
		policypackBucket, err := s3.NewBucket(ctx, "pulumi-policypacks", &s3.BucketArgs{
			// Versioning: enabled by default in newer AWS provider
		}, policypackBucketOpts...)

		if err != nil {
			return err
		}

		metadataBucketOpts := []pulumi.ResourceOption{}
		if config.ProtectResources {
			metadataBucketOpts = append(metadataBucketOpts, pulumi.Protect(true))
		}
		metadataBucket, err := s3.NewBucket(ctx, "pulumi-service-metadata", &s3.BucketArgs{
			// Versioning: enabled by default in newer AWS provider
		}, metadataBucketOpts...)

		if err != nil {
			return err
		}

		// retrieve "our" VPC to pull in our CIDR block which will be used for SG CIDR purpose
		v := ec2.LookupVpcOutput(ctx, ec2.LookupVpcOutputArgs{Id: config.VpcId})

		// TrafficManager is responsible for all high level networking appliances
		// LBs, listeners, target groups, etc
		// Containers will be attached to LBs/Listeners/TGs downstream
		trafficManager, err := network.NewTrafficManager(ctx, "pulumi-tm", &network.LoadBalancerArgs{
			AccountId:                  config.AccountId,
			CertificateArn:             config.AcmCertificateArn,
			EnabledPrivateLoadBalancer: config.EnablePrivateLoadBalancerAndLimitEgress,
			IdleTimeout:                120,
			PublicSubnetIds:            config.PublicSubnetIds,
			PrivateSubnetIds:           config.PrivateSubnetIds,
			Region:                     config.Region,
			VpcId:                      config.VpcId,
			VpcCidrBlock:               v.CidrBlock(),
			WhiteListCidrBlocks:        config.WhiteListCidrBlocks,
			ProtectResources:           config.ProtectResources,
		})

		secretsPrefix := strings.Join([]string{config.ProjectName, config.StackName}, "/")
		apiUrl := strings.Join([]string{"api", config.Route53Subdomain, config.Route53ZoneName}, ".")
		apiInternalUrl := strings.Join([]string{"api-internal", config.Route53Subdomain, config.Route53ZoneName}, ".")
		consoleUrl := strings.Join([]string{"app", config.Route53Subdomain, config.Route53ZoneName}, ".")
		domain := config.Route53ZoneName

		// generally our URLs end up something like app/api.sub-domain.domain.com
		// but we can support app/api.domain.com
		if config.Route53Subdomain == "" {
			ctx.Log.Debug("no subdomain present. Route53 zone name will be base of application URLs", nil)
			apiUrl = strings.Join([]string{"api", config.Route53ZoneName}, ".")
			apiInternalUrl = strings.Join([]string{"api-internal", config.Route53ZoneName}, ".")
			consoleUrl = strings.Join([]string{"app", config.Route53ZoneName}, ".")
		}

		if err != nil {
			return err
		}

		// common container based args for our base class
		baseArgs := &service.ContainerBaseArgs{
			AccountId:                               config.AccountId,
			CertificateArn:                          config.AcmCertificateArn,
			EnablePrivateLoadBalancerAndLimitEgress: config.EnablePrivateLoadBalancerAndLimitEgress,
			KmsServiceKeyId:                         config.KmsServiceKeyId,
			Profile:                                 config.Profile,
			PrefixListId:                            config.PrefixListId,
			PrivateSubnetIds:                        config.PrivateSubnetIds,
			Region:                                  config.Region,
			SecretsManagerPrefix:                    secretsPrefix,
			VpcId:                                   config.VpcId,
			VpcCidrBlock:                            v.CidrBlock(),
			VpcEndpointSecurityGroupId:              config.EndpointSecurityGroup,
		}

		// create necessary cert and keys needed for SAML integrations
		// toggling SAML will be driven by config property
		if config.SamlArgs != nil && config.SamlArgs.Enabled && !config.SamlArgs.UserProvidedCerts {
			err = createSamlCerts(ctx, config, apiUrl)
			if err != nil {
				return err
			}
		}

		// logs will be created based on configuration
		// could be awslogs, firelens, etc
		apiLogs := log.NewLogs(ctx, config.LogType, "pulumi-api", config.Region, config.LogArgs)
		_, err = service.NewApiContainerService(ctx, "pulumi-api", &service.ApiContainerServiceArgs{
			ApiUrl:                     apiUrl,
			CheckPointbucket:           checkpointsBucket,
			ConsoleUrl:                 consoleUrl,
			ContainerBaseArgs:          *baseArgs,
			ContainerCpu:               config.ApiContainerCpu,
			ContainerMemoryReservation: config.ApiContainerMemoryReservation,
			DesiredNumberTasks:         config.ApiDesiredNumberTasks,
			DisableEmailSignup:         config.ApiDisableEmailSign,
			DisableEmailLogin:          config.ApiDisableEmailLogin,
			DatabaseArgs:               config.DatabaseArgs,
			EcrRepoAccountId:           config.EcrRepoAccountId,
			ExecuteMigrations:          config.ApiExecuteMigrations,
			ImageTag:                   config.ImageTag,
			ImagePrefix:                config.ImagePrefix,
			LicenseKey:                 config.LicenseKey,
			LogDriver:                  apiLogs,
			MetadataBucket:             metadataBucket,
			PolicyPacksBucket:          policypackBucket,
			RecaptchaSecretKey:         config.RecaptchaSecretKey,
			RootDomain:                 domain,
			SamlArgs:                   config.SamlArgs,
			SmtpArgs:                   config.SmtpArgs,
			TaskMemory:                 config.ApiTaskMemory,
			TaskCpu:                    config.ApiTaskCpu,
			TrafficManager:             trafficManager,
			WhiteListCidrBlocks:        config.WhiteListCidrBlocks,
			OpenSearchUser:             config.OpenSearchUser,
			OpenSearchPassword:         config.OpenSearchPassword,
			OpenSearchDomainName:       config.OpenSearchDomainName,
			OpenSearchEndpoint:         config.OpenSearchEndpoint,
		})

		if err != nil {
			return err
		}

		consoleLogs := log.NewLogs(ctx, config.LogType, "pulumi-ui", config.Region, config.LogArgs)
		_, err = service.NewConsoleContainerService(ctx, "pulumi-ui", &service.ConsoleContainerServiceArgs{
			ApiUrl:                     apiUrl,
			ApiInternalUrl:             apiInternalUrl,
			ConsoleUrl:                 consoleUrl,
			ContainerBaseArgs:          *baseArgs,
			ContainerCpu:               config.ConsoleContainerCpu,
			ContainerMemoryReservation: config.ConsoleContainerMemoryReservation,
			DesiredNumberTasks:         config.ConsoleDesiredNumberTasks,
			EcrRepoAccountId:           config.EcrRepoAccountId,
			HideEmailSignup:            config.ConsoleHideEmailSignup,
			HideEmailLogin:             config.ConsoleHideEmailLogin,
			ImageTag:                   config.ImageTag,
			ImagePrefix:                config.ImagePrefix,
			LogDriver:                  consoleLogs,
			RecaptchaSiteKey:           config.RecaptchaSiteKey,
			AgGridLicenseKey:           config.AgGridLicenseKey,
			RootDomain:                 domain,
			SamlSsoEnabled:             config.SamlArgs.Enabled,
			TaskMemory:                 config.ConsoleTaskMemory,
			TaskCpu:                    config.ConsoleTaskCpu,
			TrafficManager:             trafficManager,
			WhiteListCidrBlocks:        config.WhiteListCidrBlocks,
		})

		if err != nil {
			return err
		}

		ctx.Export("checkpointsS3BucketName", checkpointsBucket.Bucket)
		ctx.Export("policyPacksS3BucketName", policypackBucket.Bucket)
		ctx.Export("metadataS3BucketName", metadataBucket.Bucket)
		ctx.Export("publicLoadBalancerDnsName", trafficManager.Public.LoadBalancer.DnsName)
		ctx.Export("publicLoadBalancerZoneId", trafficManager.Public.LoadBalancer.ZoneId)
		ctx.Export("route53ZoneName", pulumi.String(config.Route53ZoneName))
		ctx.Export("route53Subdomain", pulumi.String(config.Route53Subdomain))

		if config.EnablePrivateLoadBalancerAndLimitEgress {
			ctx.Export("internalLoadBalancerDnsName", trafficManager.Internal.LoadBalancer.DnsName)
			ctx.Export("internalLoadBalancerZoneId", trafficManager.Internal.LoadBalancer.ZoneId)
		}

		if config.SamlArgs != nil && config.SamlArgs.Enabled {
			ctx.Export("private", config.SamlArgs.CertPrivateKey)
		}

		return nil
	})
}

// Create a private and public certificate used to enable SAML SSO authentication
func createSamlCerts(ctx *pulumi.Context, config *config.ConfigArgs, apiUrl string) error {
	privateKey, err := tls.NewPrivateKey(ctx, "sso-key", &tls.PrivateKeyArgs{
		Algorithm: pulumi.String("RSA"),
		RsaBits:   pulumi.Int(2048),
	})

	if err != nil {
		return err
	}

	cert, err := tls.NewSelfSignedCert(ctx, "sso-cert", &tls.SelfSignedCertArgs{
		AllowedUses:   pulumi.StringArray{pulumi.String("cert_signing")},
		PrivateKeyPem: privateKey.PrivateKeyPem,
		Subject: tls.SelfSignedCertSubjectArgs{
			CommonName: pulumi.String(apiUrl),
		},
		ValidityPeriodHours: pulumi.Int(365 * 24),
	})

	if err != nil {
		return err
	}

	config.SamlArgs.CertPublicKey = cert.CertPem
	config.SamlArgs.CertPrivateKey = privateKey.PrivateKeyPem

	return nil
}
