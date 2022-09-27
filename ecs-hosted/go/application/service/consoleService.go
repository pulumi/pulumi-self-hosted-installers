package service

import (
	"encoding/json"
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/ec2"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/lb"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/application/log"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/application/network"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/application/utils"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
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

	listenerConditions := &lb.ListenerRuleConditionArray{
		lb.ListenerRuleConditionArgs{
			HostHeader: lb.ListenerRuleConditionHostHeaderArgs{
				Values: pulumi.StringArray{pulumi.String(args.ConsoleUrl)},
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

	tgName := fmt.Sprintf("%s-tg", name)
	tgOptions := append(options, pulumi.DeleteBeforeReplace(true))
	tg, err := lb.NewTargetGroup(ctx, tgName, &lb.TargetGroupArgs{
		VpcId:      args.VpcId,
		Protocol:   pulumi.String("HTTP"),
		Port:       pulumi.Int(consolePort),
		TargetType: pulumi.String("ip"),
		HealthCheck: &lb.TargetGroupHealthCheckArgs{
			Interval:           pulumi.Int(10), //seconds
			Path:               pulumi.String("/"),
			Port:               pulumi.String(fmt.Sprintf("%d", consolePort)),
			Protocol:           pulumi.String("HTTP"),
			Matcher:            pulumi.String("200-299"),
			Timeout:            pulumi.Int(5), //seconds
			HealthyThreshold:   pulumi.Int(5),
			UnhealthyThreshold: pulumi.Int(2),
		},
	}, tgOptions...)

	if err != nil {
		return nil, err
	}

	httpsListener, err := args.TrafficManager.Public.CreateListenerRule(ctx, fmt.Sprintf("%s-https", name), true, tg.Arn, listenerConditions, options...)
	if err != nil {
		return nil, err
	}

	httpListener, err := args.TrafficManager.Public.CreateListenerRule(ctx, fmt.Sprintf("%s-http", name), false, tg.Arn, listenerConditions, options...)
	if err != nil {
		return nil, err
	}

	serviceOptions := append(options, pulumi.DependsOn([]pulumi.Resource{httpsListener, httpListener}))
	resource.ContainerService, err = NewContainerService(ctx, name, &ContainerServiceArgs{
		ContainerBaseArgs:          args.ContainerBaseArgs,
		PulumiLoadBalancer:         args.TrafficManager.Public,
		PulumiInternalLoadBalancer: args.TrafficManager.Internal,
		TargetPort:                 consolePort,
		TaskDefinitionArgs:         taskArgs,
		TargetGroups:               []*lb.TargetGroup{tg},
	}, serviceOptions...)

	if err != nil {
		return nil, err
	}

	sgOptions := append(options, pulumi.DeleteBeforeReplace(true))
	_, err = ec2.NewSecurityGroupRule(ctx, fmt.Sprintf("%s-lb-to-ecs-rule", name), &ec2.SecurityGroupRuleArgs{
		Type:                  pulumi.String("egress"),
		SecurityGroupId:       args.TrafficManager.Public.SecurityGroup.ID(),
		SourceSecurityGroupId: resource.ContainerService.SecurityGroup.ID(),
		FromPort:              pulumi.Int(consolePort),
		ToPort:                pulumi.Int(consolePort),
		Protocol:              pulumi.String("TCP"),
		Description:           pulumi.String("Allow access from UI LB to ecs service"),
	}, sgOptions...)

	if err != nil {
		return nil, err
	}

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
	fullQualifiedImage := utils.NewEcrImageTag(ecrAccountId, args.Region, imageName, args.ImagePrefix)

	// resolve all needed outputs to construct our container definition in JSON
	conatinerDefinitions, _ := pulumi.All(
		args.TrafficManager.Public.LoadBalancer.DnsName,
		args.LogDriver).ApplyT(func(applyArgs []interface{}) (string, error) {

		dnsName := applyArgs[0].(string)
		logDriver := applyArgs[1].(log.LogDriver)

		containerJson, err := json.Marshal([]interface{}{
			map[string]interface{}{
				"cpu":               containerCpu,
				"environment":       newConsoleEnvironmentVariables(args, dnsName),
				"image":             fullQualifiedImage,
				"logConfiguration":  logDriver.GetConfiguration(),
				"memoryReservation": containerMemoryRes,
				"name":              consoleContainerName,
				"portMappings": []map[string]interface{}{
					{
						"containerPort": consolePort,
					},
				},
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
		CreateEnvVar("AWS_REGION", args.Region),
		CreateEnvVar("LOGIN_RECAPTCHA_SITE_KEY", args.RecaptchaSiteKey),
		CreateEnvVar("PULUMI_API", fmt.Sprintf("https://%s", args.ApiUrl)),
		CreateEnvVar("PULUMI_CONSOLE_DOMAIN", args.ConsoleUrl),
		CreateEnvVar("PULUMI_HOMEPAGE_DOMAIN", args.ConsoleUrl),
		CreateEnvVar("PULUMI_ROOT_DOMAIN", args.RootDomain),
		CreateEnvVar("RECAPTCHA_SITE_KEY", args.RecaptchaSiteKey),
	}

	// this URL should correspond to a route53 A record which aliases the internal private NLB
	// this is only needed when egress on the ECS service SG is locked down to VPC CIDR
	// ALB's don't have static IP addresses, hence, the NLB
	if args.EnablePrivateLoadBalancerAndLimitEgress {
		env = append(env, CreateEnvVar("PULUMI_API_INTERNAL_ENDPOINT", fmt.Sprintf("https://%s", args.ApiInternalUrl)))
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

	ApiUrl                     string
	ApiInternalUrl             string
	ConsoleUrl                 string
	ContainerCpu               int
	ContainerMemoryReservation int
	DesiredNumberTasks         int
	EcrRepoAccountId           string
	HideEmailSignup            bool
	HideEmailLogin             bool
	ImageTag                   string
	ImagePrefix                string
	LogDriver                  log.LogDriver
	RecaptchaSiteKey           string
	RootDomain                 string
	SamlSsoEnabled             bool
	TaskMemory                 int
	TaskCpu                    int
	TrafficManager             *network.TrafficManager
	WhiteListCidrBlocks        []string
}

type ConsoleContainerService struct {
	pulumi.ResourceState

	ContainerService *ContainerService
}
