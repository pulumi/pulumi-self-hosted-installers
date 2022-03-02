package service

import (
	"encoding/json"
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/ec2"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/kms"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/lb"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/s3"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/application/config"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/application/log"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/application/network"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/application/utils"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/common"
)

const apiPort = 8080
const apiContainerName = "pulumi-service"

/*
Entry point to creating the Pulumi API Container Service
API specific values like ECS Container Definition, health check, listener conditions, etc will be constructed here
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

	healthCheck := &lb.TargetGroupHealthCheckArgs{
		Interval:           pulumi.Int(10), //seconds
		Path:               pulumi.String("/api/status"),
		Port:               pulumi.String(fmt.Sprintf("%d", apiPort)),
		Protocol:           pulumi.String("HTTP"),
		Matcher:            pulumi.String("200-299"),
		Timeout:            pulumi.Int(5), //seconds
		HealthyThreshold:   pulumi.Int(5),
		UnhealthyThreshold: pulumi.Int(2),
	}

	listenerConditions := &lb.ListenerRuleConditionArray{
		lb.ListenerRuleConditionArgs{
			HostHeader: lb.ListenerRuleConditionHostHeaderArgs{
				Values: pulumi.StringArray{pulumi.String(args.ApiUrl), args.TrafficManager.Api.LoadBalancer.DnsName},
			},
		},
		lb.ListenerRuleConditionArgs{
			PathPattern: lb.ListenerRuleConditionPathPatternArgs{
				Values: pulumi.StringArray{pulumi.String("/*")},
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
	}

	if args.SmtpArgs != nil {
		ctx.Log.Debug("SMTP enabled", nil)
		secretValues = append(secretValues, Secret{
			Name:  "SMTP_PASSWORD",
			Value: args.SmtpArgs.Password,
		})
	}

	if args.SamlArgs != nil {
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

	resource.ContainerService, err = NewContainerService(ctx, name, &ContainerServiceArgs{
		ContainerBaseArgs:  args.ContainerBaseArgs,
		HealthCheck:        healthCheck,
		ListenerPriority:   1,
		ListenerConditions: listenerConditions,
		PulumiLoadBalancer: args.TrafficManager.Api,
		TargetPort:         apiPort,
		TaskDefinitionArgs: taskArgs,
	}, options...)

	if err != nil {
		return nil, err
	}

	_, err = NewMigrationsService(ctx, fmt.Sprintf("%s-migrations", name), &MigrationsContainerServiceArgs{
		ContainerBaseArgs: args.ContainerBaseArgs,
		DatabaseArgs:      args.DatabaseArgs,
		EcrRepoAccountId:  args.EcrRepoAccountId,
		ImageTag:          args.ImageTag,
	}, options...)

	if err != nil {
		return nil, err
	}

	apidbOptions := append(options, pulumi.DeleteBeforeReplace(true), pulumi.Aliases([]pulumi.Alias{{Name: pulumi.String("pulumi-service-api-to-db-rule")}}))

	_, err = ec2.NewSecurityGroupRule(ctx, fmt.Sprintf("%s-ecs-to-db-rule", name), &ec2.SecurityGroupRuleArgs{
		Type:                  pulumi.String("ingress"),
		SecurityGroupId:       args.DatabaseArgs.SecurityGroupId,
		SourceSecurityGroupId: resource.ContainerService.SecurityGroup.ID(),
		FromPort:              pulumi.Int(3306),
		ToPort:                pulumi.Int(3306),
		Protocol:              pulumi.String("TCP"),
	}, apidbOptions...)

	if err != nil {
		return nil, err
	}

	lbapiOptions := append(options, pulumi.DeleteBeforeReplace(true), pulumi.Aliases([]pulumi.Alias{{Name: pulumi.String("pulumi-service-lb-to-api-rule")}}))
	_, err = ec2.NewSecurityGroupRule(ctx, fmt.Sprintf("%s-lb-to-ecs-rule", name), &ec2.SecurityGroupRuleArgs{
		Type:                  pulumi.String("egress"),
		SecurityGroupId:       args.TrafficManager.Api.SecurityGroup.ID(),
		SourceSecurityGroupId: resource.ContainerService.SecurityGroup.ID(),
		FromPort:              pulumi.Int(apiPort),
		ToPort:                pulumi.Int(apiPort),
		Protocol:              pulumi.String("TCP"),
	}, lbapiOptions...)

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

	// resolve all needed outputs to construct our container definition in JSON
	conatinerDefinitions, _ := pulumi.All(
		args.DatabaseArgs.ClusterEndpoint, // 0
		args.DatabaseArgs.Username,        // 1
		args.DatabaseArgs.Password,        // 2
		args.DatabaseArgs.Port,            // 3
		secrets.Secrets,                   // 4
		args.CheckPointbucket.Bucket,      // 5
		args.PolicyPacksBucket.Bucket,     // 6
		args.LogDriver,                    // 7
		args.SamlArgs).ApplyT(func(applyArgs []interface{}) (string, error) {

		dbEndpoint := applyArgs[0].(string)
		dbPort := applyArgs[3].(int)
		checkpointBucket := applyArgs[5].(string)
		policypackBucket := applyArgs[6].(string)
		secretsOutput := applyArgs[4].([]map[string]interface{})
		logDriver := applyArgs[7].(log.LogDriver)

		containerJson, err := json.Marshal([]interface{}{
			map[string]interface{}{
				"name":              apiContainerName,
				"image":             utils.NewEcrImageTag(ecrAccountId, args.Region, imageName),
				"cpu":               containerCpu,
				"memoryReservation": containerMemoryRes,
				"ulimits": []map[string]interface{}{
					{
						"softLimit": 100000,
						"hardLimit": 200000,
						"name":      "nofile",
					},
				},
				"portMappings": []map[string]interface{}{
					{
						"containerPort": apiPort,
					},
				},
				"environment":      newApiEnvironmentVariables(args, dbEndpoint, dbPort, checkpointBucket, policypackBucket),
				"secrets":          secretsOutput,
				"logConfiguration": logDriver.GetConfiguration(),
			},
		})

		ctx.Log.Info(string(containerJson), nil)

		if err != nil {
			return "", err
		}

		return string(containerJson), nil
	}).(pulumi.StringOutput)

	s3AccessPolicyDoc := pulumi.All(args.CheckPointbucket.Bucket, args.PolicyPacksBucket.Bucket).ApplyT(func(applyArgs []interface{}) (string, error) {

		checkpointBucket := applyArgs[0].(string)
		policypackBucket := applyArgs[1].(string)

		checkpointBucketArn := common.GetIamPolicyArn(args.Region, fmt.Sprintf("arn:aws:s3:::%s", checkpointBucket))
		policypackBucketArn := common.GetIamPolicyArn(args.Region, fmt.Sprintf("arn:aws:s3:::%s", policypackBucket))

		policyDoc, err := json.Marshal(map[string]interface{}{
			"Version": "2012-10-17",
			"Statement": []map[string]interface{}{
				{
					"Effect": "Allow",
					"Action": []string{"s3:*"},
					"Resource": []string{
						checkpointBucketArn,
						fmt.Sprintf("%s/*", checkpointBucketArn),
						policypackBucketArn,
						fmt.Sprintf("%s/*", policypackBucketArn),
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
		kmsDoc, err := json.Marshal(map[string]interface{}{
			"Version": "2012-10-17",
			"Statement": []map[string]interface{}{
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

func newApiEnvironmentVariables(args *ApiContainerServiceArgs, dbEndpoint string, dbPort int, checkpointBucket string, policypackBucket string) []map[string]interface{} {

	env := []map[string]interface{}{
		CreateEnvVar("PULUMI_LICENSE_KEY", args.LicenseKey),
		CreateEnvVar("PULUMI_ENTERPRISE", "true"),
		CreateEnvVar("PULUMI_DATABASE_ENDPOINT", fmt.Sprintf("%s:%d", dbEndpoint, dbPort)),
		CreateEnvVar("PULUMI_DATABASE_PING_ENDPOINT", dbEndpoint),
		CreateEnvVar("PULUMI_DATABASE_NAME", "pulumi"),
		CreateEnvVar("PULUMI_API_DOMAIN", args.ApiUrl),
		CreateEnvVar("PULUMI_CONSOLE_DOMAIN", args.ConsoleUrl),
		CreateEnvVar("PULUMI_OBJECTS_BUCKET", checkpointBucket),
		CreateEnvVar("PULUMI_POLICY_PACK_BUCKET", policypackBucket),
		CreateEnvVar("PULUMI_KMS_KEY", args.KmsServiceKeyId),
		CreateEnvVar("AWS_REGION", args.Region),
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

	if args.SamlArgs != nil {
		env = append(env, CreateEnvVar("SAML_CERTIFICATE_PUBLIC_KEY", args.SamlArgs.CertPublicKey))
	}

	return env
}

func CreateEnvVar(name string, value string) map[string]interface{} {
	return map[string]interface{}{
		"name":  name,
		"value": value,
	}
}

type ApiContainerServiceArgs struct {
	ContainerBaseArgs

	ContainerMemoryReservation int // 0 check
	ContainerCpu               int // 0 check
	EcrRepoAccountId           string
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
}

type ApiContainerService struct {
	pulumi.ResourceState

	ContainerService *ContainerService
}
