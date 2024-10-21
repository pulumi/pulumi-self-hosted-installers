package service

import (
	"encoding/json"
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v6/go/aws/ec2"
	"github.com/pulumi/pulumi-aws/sdk/v6/go/aws/kms"
	"github.com/pulumi/pulumi-aws/sdk/v6/go/aws/lb"
	"github.com/pulumi/pulumi-aws/sdk/v6/go/aws/s3"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/application/config"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/application/log"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/application/network"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/application/utils"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/common"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

const apiPort = 8080
const apiContainerName = "pulumi-service"

/*
Entry point to creating the Pulumi API Container Service
API specific values like ECS Container Request, health check, listener conditions, etc will be constructed here

	before calling the base ContainerService.
*/
func NewApiContainerService(ctx *pulumi.Context, name string, args *ApiContainerServiceArgs, opts ...pulumi.ResourceOption) (*ApiContainerService, error) {
	var resource ApiContainerService

	err := ctx.RegisterComponentResource("pulumi:apiService", name, &resource, opts...)
	if err != nil {
		return nil, err
	}

	// create our parented options
	options := append(opts, pulumi.Parent(&resource))

	listenerConditions := &lb.ListenerRuleConditionArray{
		lb.ListenerRuleConditionArgs{
			HostHeader: lb.ListenerRuleConditionHostHeaderArgs{
				Values: pulumi.StringArray{
					pulumi.String(args.ApiUrl),
				},
			},
		},
	}

	// secrets file
	secretValues := []Secret{
		{
			Name:  "PULUMI_DATABASE_USER_NAME",
			Value: args.DatabaseArgs.Username,
		},
		{
			Name:  "PULUMI_DATABASE_USER_PASSWORD",
			Value: args.DatabaseArgs.Password,
		},
		{
			Name:  "RECAPTCHA_SECRET_KEY",
			Value: pulumi.String(args.RecaptchaSecretKey).ToStringOutput(),
		},
		{
			Name:  "LOGIN_RECAPTCHA_SECRET_KEY",
			Value: pulumi.String(args.RecaptchaSecretKey).ToStringOutput(),
		},
		{
			// TODO: what if this value isn't present? we need to control this a bit better
			Name:  "PULUMI_SEARCH_PASSWORD",
			Value: args.OpenSearchPassword,
		},
	}

	if args.SmtpArgs != nil {
		ctx.Log.Debug("SMTP enabled", nil)
		secretValues = append(secretValues, Secret{
			Name:  "SMTP_PASSWORD",
			Value: args.SmtpArgs.Password,
		})
	}

	if args.SamlArgs.Enabled {
		ctx.Log.Debug("SAML SSO enabled", nil)
		secretValues = append(secretValues, Secret{
			Name:  "SAML_CERTIFICATE_PRIVATE_KEY",
			Value: args.SamlArgs.CertPrivateKey,
		})
	}

	secrets, err := NewSecrets(ctx, fmt.Sprintf("%s-secrets", name), &SecretsArgs{
		Prefix:   args.SecretsManagerPrefix,
		KmsKeyId: args.KmsServiceKeyId,
		Secrets:  secretValues,
	}, options...)

	if err != nil {
		return nil, err
	}

	taskArgs, err := newApiTaskArgs(ctx, args, secrets)
	if err != nil {
		return nil, err
	}

	tgName := fmt.Sprintf("%s-tg", name)
	deleteBeforeReplaceOpts := append(options, pulumi.DeleteBeforeReplace(true))
	tg, err := lb.NewTargetGroup(ctx, tgName, &lb.TargetGroupArgs{
		VpcId:      args.VpcId,
		Protocol:   pulumi.String("HTTP"),
		Port:       pulumi.Int(apiPort),
		TargetType: pulumi.String("ip"),
		HealthCheck: &lb.TargetGroupHealthCheckArgs{
			Interval:           pulumi.Int(10), //seconds
			Path:               pulumi.String("/api/status"),
			Port:               pulumi.String(fmt.Sprintf("%d", apiPort)),
			Protocol:           pulumi.String("HTTP"),
			Matcher:            pulumi.String("200-299"),
			Timeout:            pulumi.Int(5), //seconds
			HealthyThreshold:   pulumi.Int(5),
			UnhealthyThreshold: pulumi.Int(2),
		},
	}, deleteBeforeReplaceOpts...)

	if err != nil {
		return nil, err
	}

	serviceTgs := []*lb.TargetGroup{tg}

	httpsListener, err := args.TrafficManager.Public.CreateListenerRule(ctx, fmt.Sprintf("%s-https", name), true, tg.Arn, listenerConditions, options...)
	if err != nil {
		return nil, err
	}

	httpListener, err := args.TrafficManager.Public.CreateListenerRule(ctx, fmt.Sprintf("%s-http", name), false, tg.Arn, listenerConditions, options...)
	if err != nil {
		return nil, err
	}

	// create listeners and target groups for NLB -> API
	serviceOptions := append(options, pulumi.DependsOn([]pulumi.Resource{httpsListener, httpListener}))

	if args.EnablePrivateLoadBalancerAndLimitEgress {
		// 2 new target groups
		// 2 listeners (http and https)
		// map tgs into ecs service for LB purposes

		privateHttpsTg, err := lb.NewTargetGroup(ctx, fmt.Sprintf("%s-nlb-tgs", name), &lb.TargetGroupArgs{
			VpcId:      args.VpcId,
			Protocol:   pulumi.String("TCP"),
			Port:       pulumi.Int(apiPort),
			TargetType: pulumi.String("ip"),
		}, deleteBeforeReplaceOpts...)

		if err != nil {
			return nil, err
		}

		privateHttpsListener, err := args.TrafficManager.Internal.CreateListener(ctx, fmt.Sprintf("%s-https", name), privateHttpsTg.Arn, args.CertificateArn, options...)
		if err != nil {
			return nil, err
		}

		privateHttpTg, err := lb.NewTargetGroup(ctx, fmt.Sprintf("%s-nlb-tg", name), &lb.TargetGroupArgs{
			VpcId:      args.VpcId,
			Protocol:   pulumi.String("TCP"),
			Port:       pulumi.Int(apiPort),
			TargetType: pulumi.String("ip"),
		}, deleteBeforeReplaceOpts...)

		if err != nil {
			return nil, err
		}

		privateHttpListener, err := args.TrafficManager.Internal.CreateListener(ctx, fmt.Sprintf("%s-http", name), privateHttpTg.Arn, "", options...)
		if err != nil {
			return nil, err
		}

		serviceTgs = append(serviceTgs, privateHttpTg, privateHttpsTg)
		serviceOptions = append(serviceOptions, pulumi.DependsOn([]pulumi.Resource{privateHttpListener, privateHttpsListener}))
	}

	dbSgEgressRules := ec2.SecurityGroupEgressArray{
		ec2.SecurityGroupEgressArgs{
			FromPort:       pulumi.Int(3306),
			ToPort:         pulumi.Int(3306),
			SecurityGroups: pulumi.StringArray{args.DatabaseArgs.SecurityGroupId},
			Protocol:       pulumi.String("TCP"),
			Description:    pulumi.String("Allow SG egress from ECS Service to Aurora DB"),
		},
		ec2.SecurityGroupEgressArgs{
			FromPort:    pulumi.Int(3306),
			ToPort:      pulumi.Int(3306),
			CidrBlocks:  pulumi.StringArray{args.VpcCidrBlock},
			Protocol:    pulumi.String("TCP"),
			Description: pulumi.String("Allow VPC CIDR egress from ECS service on DB Port"),
		},
	}

	resource.ContainerService, err = NewContainerService(ctx, name, &ContainerServiceArgs{
		ContainerBaseArgs:          args.ContainerBaseArgs,
		TargetGroups:               serviceTgs,
		PulumiLoadBalancer:         args.TrafficManager.Public,
		PulumiInternalLoadBalancer: args.TrafficManager.Internal,
		TargetPort:                 apiPort,
		TaskDefinitionArgs:         taskArgs,
		SecurityGroupEgressRules:   dbSgEgressRules,
	}, serviceOptions...)

	if err != nil {
		return nil, err
	}

	// Allow access out of ALBs SG to ECS SG
	_, err = ec2.NewSecurityGroupRule(ctx, fmt.Sprintf("%s-alb-to-ecs-rule", name), &ec2.SecurityGroupRuleArgs{
		Type:                  pulumi.String("egress"),
		SecurityGroupId:       args.TrafficManager.Public.SecurityGroup.ID(),
		SourceSecurityGroupId: resource.ContainerService.SecurityGroup.ID(),
		FromPort:              pulumi.Int(apiPort),
		ToPort:                pulumi.Int(apiPort),
		Protocol:              pulumi.String("TCP"),
		Description:           pulumi.String("Allow access from API LB to ecs service"),
	}, deleteBeforeReplaceOpts...)

	if err != nil {
		return nil, err
	}

	// DB to allow communication from ECS API tasks and vice versa
	_, err = ec2.NewSecurityGroupRule(ctx, fmt.Sprintf("%s-ecs-to-db-rule", name), &ec2.SecurityGroupRuleArgs{
		Type:                  pulumi.String("ingress"),
		SecurityGroupId:       args.DatabaseArgs.SecurityGroupId,
		SourceSecurityGroupId: resource.ContainerService.SecurityGroup.ID(),
		FromPort:              pulumi.Int(3306),
		ToPort:                pulumi.Int(3306),
		Protocol:              pulumi.String("TCP"),
	}, deleteBeforeReplaceOpts...)

	if err != nil {
		return nil, err
	}

	_, err = NewMigrationsService(ctx, fmt.Sprintf("%s-migrations", name), &MigrationsContainerServiceArgs{
		ContainerBaseArgs:        args.ContainerBaseArgs,
		DatabaseArgs:             args.DatabaseArgs,
		EcrRepoAccountId:         args.EcrRepoAccountId,
		ImageTag:                 args.ImageTag,
		ImagePrefix:              args.ImagePrefix,
		ExecuteMigrations:        args.ExecuteMigrations,
		SecurityGroupEgressRules: dbSgEgressRules,
	}, options...)

	if err != nil {
		return nil, err
	}

	return &resource, nil
}

func newApiTaskArgs(ctx *pulumi.Context, args *ApiContainerServiceArgs, secrets *SecretsOutput) (*TaskDefinitionArgs, error) {
	// set out defaults for the api container task(s)
	taskMemory := 1024
	if args.TaskMemory > 0 {
		taskMemory = args.TaskMemory
	}

	taskCpu := 512
	if args.TaskCpu > 0 {
		taskCpu = args.TaskCpu
	}

	containerMemoryRes := 384
	if args.ContainerMemoryReservation > 0 {
		containerMemoryRes = args.ContainerMemoryReservation
	}

	containerCpu := taskCpu
	if args.ContainerCpu > 0 {
		containerCpu = args.ContainerCpu
	}

	numberDesiredTasks := 3
	if args.DesiredNumberTasks > 0 {
		numberDesiredTasks = args.DesiredNumberTasks
	}

	ecrAccountId := args.AccountId
	if args.EcrRepoAccountId != "" {
		ecrAccountId = args.EcrRepoAccountId
	}

	imageName := fmt.Sprintf("pulumi/service:%s", args.ImageTag)
	fullQualifiedImage := utils.NewEcrImageTag(ecrAccountId, args.Region, imageName, args.ImagePrefix)

	inputs := []any{
		args.DatabaseArgs.ClusterEndpoint,
		args.DatabaseArgs.Port,
		secrets.Secrets,
		args.CheckPointbucket.Bucket,
		args.PolicyPacksBucket.Bucket,
		args.MetadataBucket.Bucket,
		args.LogDriver,
		args.OpenSearchUser,
		args.OpenSearchEndpoint,
	}

	if args.SamlArgs.Enabled {
		inputs = append(inputs, args.SamlArgs.CertPublicKey)
	}

	// resolve all needed outputs to construct our container definition in JSON
	conatinerDefinitions, _ := pulumi.All(
		inputs...,
	).ApplyT(func(applyArgs []any) (string, error) {

		dbEndpoint := applyArgs[0].(string)
		dbPort := applyArgs[1].(int)
		secretsOutput := applyArgs[2].([]map[string]any)
		checkpointBucket := applyArgs[3].(string)
		policypackBucket := applyArgs[4].(string)
		metadataBucket := applyArgs[5].(string)
		logDriver := applyArgs[6].(log.LogDriver)
		OpenSearchUser := applyArgs[7].(string)
		OpenSearchEndpoint := applyArgs[8].(string)

		samlCertPublicKey := ""
		if len(inputs) > 7 {
			samlCertPublicKey = applyArgs[7].(string)
		}

		envArgs := &ApiContainerEnvironment{
			ApiContainerArgs:   args,
			DbEndpoint:         dbEndpoint,
			DbPort:             dbPort,
			CheckPointBucket:   checkpointBucket,
			PolicyPackBucket:   policypackBucket,
			MetadataBucket:     metadataBucket,
			SamlPublicKey:      samlCertPublicKey,
			OpenSearchUser:     OpenSearchUser,
			OpenSearchEndpoint: OpenSearchEndpoint,
		}

		containerJson, err := json.Marshal([]any{
			map[string]any{
				"cpu":               containerCpu,
				"environment":       newApiEnvironmentVariables(*envArgs),
				"image":             fullQualifiedImage,
				"logConfiguration":  logDriver.GetConfiguration(),
				"memoryReservation": containerMemoryRes,
				"name":              apiContainerName,
				"portMappings": []map[string]any{
					{
						"containerPort": apiPort,
					},
				},
				"secrets": secretsOutput,
				"ulimits": []map[string]any{
					{
						"softLimit": 100000,
						"hardLimit": 200000,
						"name":      "nofile",
					},
				},
			},
		})

		if err != nil {
			return "", err
		}

		return string(containerJson), nil
	}).(pulumi.StringOutput)

	s3AccessPolicyDoc := pulumi.All(args.CheckPointbucket.Bucket, args.PolicyPacksBucket.Bucket, args.MetadataBucket.Bucket).ApplyT(func(applyArgs []any) (string, error) {

		checkpointBucket := applyArgs[0].(string)
		policypackBucket := applyArgs[1].(string)
		metadataBucket := applyArgs[2].(string)

		checkpointBucketArn := common.GetIamPolicyArn(args.Region, fmt.Sprintf("arn:aws:s3:::%s", checkpointBucket))
		policypackBucketArn := common.GetIamPolicyArn(args.Region, fmt.Sprintf("arn:aws:s3:::%s", policypackBucket))
		metadataBucketArn := common.GetIamPolicyArn(args.Region, fmt.Sprintf("arn:aws:s3:::%s", metadataBucket))

		policyDoc, err := json.Marshal(map[string]any{
			"Version": "2012-10-17",
			"Statement": []map[string]any{
				{
					"Effect": "Allow",
					"Action": []string{"s3:*"},
					"Resource": []string{
						checkpointBucketArn,
						fmt.Sprintf("%s/*", checkpointBucketArn),
						policypackBucketArn,
						fmt.Sprintf("%s/*", policypackBucketArn),
						metadataBucketArn,
						fmt.Sprintf("%s/*", metadataBucketArn),
					},
				},
			},
		})

		if err != nil {
			return "", nil
		}

		return string(policyDoc), nil
	}).(pulumi.StringOutput)

	kmsKey, err := kms.GetKey(ctx, "kms-service-key", pulumi.ID(args.KmsServiceKeyId), nil)

	if err != nil {
		return nil, err
	}

	kmsPolicyDoc := kmsKey.Arn.ApplyT(func(arn string) (string, error) {
		kmsDoc, err := json.Marshal(map[string]any{
			"Version": "2012-10-17",
			"Statement": []map[string]any{
				{
					"Effect": "Allow",
					"Action": []string{
						"kms:Decrypt",
						"kms:GenerateDataKeyWithoutPlaintext",
					},
					"Resource": []string{arn},
				},
			},
		})

		if err != nil {
			return "", nil
		}

		return string(kmsDoc), nil
	}).(pulumi.StringOutput)

	if err != nil {
		return nil, err
	}

	return &TaskDefinitionArgs{
		ContainerDefinitions: conatinerDefinitions,
		TaskRolePolicyDocs:   pulumi.StringArray{s3AccessPolicyDoc, kmsPolicyDoc},
		NumberDesiredTasks:   numberDesiredTasks,
		Cpu:                  taskCpu,
		Memory:               taskMemory,
		ContainerName:        apiContainerName,
		ContainerPort:        apiPort,
	}, nil
}

func newApiEnvironmentVariables(environmentArgs ApiContainerEnvironment) []map[string]any {
	args := environmentArgs.ApiContainerArgs

	env := []map[string]any{
		CreateEnvVar("PULUMI_LICENSE_KEY", args.LicenseKey),
		CreateEnvVar("PULUMI_ENTERPRISE", "true"),
		CreateEnvVar("PULUMI_DATABASE_ENDPOINT", fmt.Sprintf("%s:%d", environmentArgs.DbEndpoint, environmentArgs.DbPort)),
		CreateEnvVar("PULUMI_DATABASE_PING_ENDPOINT", environmentArgs.DbEndpoint),
		CreateEnvVar("PULUMI_DATABASE_NAME", "pulumi"),
		CreateEnvVar("PULUMI_API_DOMAIN", args.ApiUrl),
		CreateEnvVar("PULUMI_CONSOLE_DOMAIN", args.ConsoleUrl),
		CreateEnvVar("PULUMI_CHECKPOINT_BLOB_STORAGE_ENDPOINT", "s3://"+environmentArgs.CheckPointBucket),
		CreateEnvVar("PULUMI_POLICY_PACK_BLOB_STORAGE_ENDPOINT", "s3://"+environmentArgs.PolicyPackBucket),
		CreateEnvVar("PULUMI_SERVICE_METADATA_BLOB_STORAGE_ENDPOINT", "s3://"+environmentArgs.MetadataBucket),
		CreateEnvVar("PULUMI_KMS_KEY", args.KmsServiceKeyId),
		CreateEnvVar("AWS_REGION", args.Region),
		CreateEnvVar("PULUMI_SEARCH_USER", environmentArgs.OpenSearchUser),
		CreateEnvVar("PULUMI_SEARCH_DOMAIN", environmentArgs.OpenSearchEndpoint),
	}

	if args.DisableEmailLogin {
		env = append(env, CreateEnvVar("PULUMI_DISABLE_EMAIL_LOGIN", "true"))
	}

	if args.DisableEmailSignup {
		env = append(env, CreateEnvVar("PULUMI_DISABLE_EMAIL_SIGNUP", "true"))
	}

	if args.SmtpArgs != nil {
		env = append(env, CreateEnvVar("SMTP_USERNAME", args.SmtpArgs.Username))
		env = append(env, CreateEnvVar("SMTP_SERVER", args.SmtpArgs.Server))
		env = append(env, CreateEnvVar("SMTP_GENERIC_SENDER", args.SmtpArgs.GenericSender))
	}

	if args.SamlArgs.Enabled && environmentArgs.SamlPublicKey != "" {
		env = append(env, CreateEnvVar("SAML_CERTIFICATE_PUBLIC_KEY", environmentArgs.SamlPublicKey))
	}

	return env
}

func CreateEnvVar(name string, value string) map[string]any {
	return map[string]any{
		"name":  name,
		"value": value,
	}
}

type ApiContainerServiceArgs struct {
	ContainerBaseArgs

	ContainerMemoryReservation int
	ContainerCpu               int
	EcrRepoAccountId           string
	ImagePrefix                string
	ImageTag                   string
	LicenseKey                 string
	LogDriver                  log.LogDriver
	RecaptchaSecretKey         string
	SamlArgs                   *config.SamlArgs
	TaskMemory                 int
	TaskCpu                    int
	TrafficManager             *network.TrafficManager
	DesiredNumberTasks         int
	DisableEmailSignup         bool
	DisableEmailLogin          bool
	DatabaseArgs               *config.DatabaseArgs
	SmtpArgs                   *config.SmtpArgs
	ConsoleUrl                 string
	ApiUrl                     string
	RootDomain                 string
	WhiteListCidrBlocks        []string
	CheckPointbucket           *s3.Bucket
	PolicyPacksBucket          *s3.Bucket
	MetadataBucket             *s3.Bucket
	ExecuteMigrations          bool
	OpenSearchUser             pulumi.StringOutput
	OpenSearchPassword         pulumi.StringOutput
	OpenSearchDomainName       pulumi.StringOutput
	OpenSearchEndpoint         pulumi.StringOutput
}

type ApiContainerService struct {
	pulumi.ResourceState

	ContainerService *ContainerService
}

type ApiContainerEnvironment struct {
	ApiContainerArgs   *ApiContainerServiceArgs
	DbEndpoint         string
	DbPort             int
	CheckPointBucket   string
	PolicyPackBucket   string
	MetadataBucket     string
	SamlPublicKey      string
	OpenSearchUser     string
	OpenSearchEndpoint string
}
