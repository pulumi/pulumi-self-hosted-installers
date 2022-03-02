package service

import (
	"encoding/json"
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/ec2"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/lb"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/application/log"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/application/network"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/application/utils"
)

const consolePort = 3000
const consoleContainerName = "pulumi-service"

func NewConsoleContainerService(ctx *pulumi.Context, name string, args *ConsoleContainerServiceArgs, opts ...pulumi.ResourceOption) (*ConsoleContainerService, error) {
	var resource ConsoleContainerService

	err := ctx.RegisterComponentResource("pulumi:consoleService", name, &resource, opts...)
	if err != nil {
		return nil, err
	}

	// create our parented options
	options := append(opts, pulumi.Parent(&resource))

	healthCheck := &lb.TargetGroupHealthCheckArgs{
		Interval:           pulumi.Int(10), //seconds
		Path:               pulumi.String("/"),
		Port:               pulumi.String(fmt.Sprintf("%d", consolePort)),
		Protocol:           pulumi.String("HTTP"),
		Matcher:            pulumi.String("200-299"),
		Timeout:            pulumi.Int(5), //seconds
		HealthyThreshold:   pulumi.Int(5),
		UnhealthyThreshold: pulumi.Int(2),
	}

	listenerConditions := &lb.ListenerRuleConditionArray{
		lb.ListenerRuleConditionArgs{
			HostHeader: lb.ListenerRuleConditionHostHeaderArgs{
				Values: pulumi.StringArray{pulumi.String(args.ConsoleUrl), args.TrafficManager.Console.LoadBalancer.DnsName},
			},
		},
		lb.ListenerRuleConditionArgs{
			PathPattern: lb.ListenerRuleConditionPathPatternArgs{
				Values: pulumi.StringArray{pulumi.String("/*")},
			},
		},
	}

	taskArgs, err := newConsoleTaskArgs(ctx, args)
	if err != nil {
		return nil, err
	}

	resource.ContainerService, err = NewContainerService(ctx, name, &ContainerServiceArgs{
		ContainerBaseArgs:  args.ContainerBaseArgs,
		HealthCheck:        healthCheck,
		ListenerPriority:   1,
		ListenerConditions: listenerConditions,
		PulumiLoadBalancer: args.TrafficManager.Console,
		TargetPort:         consolePort,
		TaskDefinitionArgs: taskArgs,
	}, options...)

	if err != nil {
		return nil, err
	}

	sgOptions := append(options, pulumi.DeleteBeforeReplace(true))

	_, err = ec2.NewSecurityGroupRule(ctx, fmt.Sprintf("%s-lb-to-ecs-rule", name), &ec2.SecurityGroupRuleArgs{
		Type:                  pulumi.String("egress"),
		SecurityGroupId:       args.TrafficManager.Console.SecurityGroup.ID(),
		SourceSecurityGroupId: resource.ContainerService.SecurityGroup.ID(),
		FromPort:              pulumi.Int(consolePort),
		ToPort:                pulumi.Int(consolePort),
		Protocol:              pulumi.String("TCP"),
	}, sgOptions...)

	if err != nil {
		return nil, err
	}

	return &resource, nil
}

func newConsoleTaskArgs(ctx *pulumi.Context, args *ConsoleContainerServiceArgs) (*TaskDefinitionArgs, error) {
	// set out defaults for the console container task(s)
	taskMemory := 512
	if args.TaskMemory > 0 {
		taskMemory = args.TaskMemory
	}

	taskCpu := 256
	if args.TaskCpu > 0 {
		taskCpu = args.TaskCpu
	}

	containerMemoryRes := 128
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

	imageName := fmt.Sprintf("pulumi/console:%s", args.ImageTag)

	// resolve all needed outputs to construct our container definition in JSON
	conatinerDefinitions, _ := pulumi.All(
		args.TrafficManager.Console.LoadBalancer.DnsName,
		args.LogDriver).ApplyT(func(applyArgs []interface{}) (string, error) {

		dnsName := applyArgs[0].(string)
		logDriver := applyArgs[1].(log.LogDriver)

		containerJson, err := json.Marshal([]interface{}{
			map[string]interface{}{
				"name":              consoleContainerName,
				"image":             utils.NewEcrImageTag(ecrAccountId, args.Region, imageName),
				"cpu":               containerCpu,
				"memoryReservation": containerMemoryRes,
				"portMappings": []map[string]interface{}{
					{
						"containerPort": consolePort,
					},
				},
				"environment":      newConsoleEnvironmentVariables(args, dnsName),
				"logConfiguration": logDriver.GetConfiguration(),
			},
		})

		if err != nil {
			return "", err
		}

		return string(containerJson), nil
	}).(pulumi.StringOutput)

	return &TaskDefinitionArgs{
		ContainerDefinitions: conatinerDefinitions,
		NumberDesiredTasks:   numberDesiredTasks,
		Cpu:                  taskCpu,
		Memory:               taskMemory,
		ContainerName:        consoleContainerName,
		ContainerPort:        consolePort,
	}, nil
}

func newConsoleEnvironmentVariables(args *ConsoleContainerServiceArgs, lbDnsName string) []map[string]interface{} {

	env := []map[string]interface{}{
		CreateEnvVar("PULUMI_API", fmt.Sprintf("https://%s", args.ApiUrl)),
		CreateEnvVar("PULUMI_CONSOLE_DOMAIN", args.ConsoleUrl),
		CreateEnvVar("PULUMI_HOMEPAGE_DOMAIN", args.ConsoleUrl),
		CreateEnvVar("PULUMI_ROOT_DOMAIN", args.RootDomain),
		CreateEnvVar("AWS_REGION", args.Region),
		CreateEnvVar("RECAPTCHA_SITE_KEY", args.RecaptchaSiteKey),
		CreateEnvVar("LOGIN_RECAPTCHA_SITE_KEY", args.RecaptchaSiteKey),

		// NOTE: this ENV var will cause the console to redirect requests directly to the APIs LB and can have impacts on requests from the CLI succeeding or not.
		//CreateEnvVar("PULUMI_API_INTERNAL_ENDPOINT", lbDnsName),
	}

	if args.HideEmailLogin {
		env = append(env, CreateEnvVar("PULUMI_HIDE_EMAIL_LOGIN", "true"))
	}

	if args.HideEmailLogin {
		env = append(env, CreateEnvVar("PULUMI_HIDE_EMAIL_SIGNUP", "true"))
	}

	if args.SamlSsoEnabled {
		env = append(env, CreateEnvVar("SAML_SSO_ENABLED", "true"))
	}

	return env
}

type ConsoleContainerServiceArgs struct {
	ContainerBaseArgs

	ContainerMemoryReservation int
	ContainerCpu               int
	EcrRepoAccountId           string
	ImageTag                   string
	// LogType LogType
	// LogArgs any
	RecaptchaSiteKey    string
	DesiredNumberTasks  int
	SamlSsoEnabled      bool
	TaskMemory          int
	TaskCpu             int
	TrafficManager      *network.TrafficManager
	HideEmailSignup     bool
	HideEmailLogin      bool
	ConsoleUrl          string
	ApiUrl              string
	RootDomain          string
	WhiteListCidrBlocks []string
	LogDriver           log.LogDriver
}

type ConsoleContainerService struct {
	pulumi.ResourceState

	ContainerService *ContainerService
}
