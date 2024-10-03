package config

import (
	"os"
	"strconv"

	"github.com/pulumi/pulumi-aws/sdk/v6/go/aws"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/application/log"
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

	// enabling private LB and limiting egress will enforce strict egress limits on ECS services as well as provide an additional internal LB for the API service
	resource.EnablePrivateLoadBalancerAndLimitEgress = appConfig.GetBool("enablePrivateLoadBalancerAndLimitEgress")

	// we require these values to be present in configuration (aka already created in AWS account)
	resource.AcmCertificateArn = appConfig.Require("acmCertificateArn")
	resource.KmsServiceKeyId = appConfig.Require("kmsServiceKeyId")
	resource.LicenseKey = appConfig.Require("licenseKey")
	resource.ImageTag = appConfig.Require("imageTag")

	// allows user defined prefix to be prepended to the images. eg- upstream/pulumi/service:image:tag
	resource.ImagePrefix = appConfig.Get("imagePrefix")

	// if not present, we assume ECR repo is present in our "current" AWS account
	resource.EcrRepoAccountId = appConfig.Get("ecrRepoAccountId")

	// baseStack == infrastructure stack
	stackRef, err := pulumi.NewStackReference(ctx, appConfig.Require("baseStackReference"), nil)
	if err != nil {
		return nil, err
	}

	// retrieve networking, database, and VPC output values from the infrastack
	resource.VpcId = stackRef.GetStringOutput(pulumi.String("vpcId"))
	resource.PublicSubnetIds = OutputToStringArray(stackRef.GetOutput(pulumi.String("publicSubnetIds")))
	resource.PrivateSubnetIds = OutputToStringArray(stackRef.GetOutput(pulumi.String("privateSubnetIds")))
	resource.IsolatedSubnetIds = OutputToStringArray(stackRef.GetOutput(pulumi.String("isolatedSubnetIds")))

	resource.DatabaseArgs = &DatabaseArgs{
		ClusterEndpoint: stackRef.GetStringOutput(pulumi.String("dbClusterEndpoint")),
		Name:            stackRef.GetStringOutput(pulumi.String("dbName")),
		Username:        stackRef.GetStringOutput(pulumi.String("dbUsername")),
		Password:        stackRef.GetStringOutput(pulumi.String("dbPassword")),
		Port:            stackRef.GetIntOutput(pulumi.String("dbPort")),
		SecurityGroupId: stackRef.GetStringOutput(pulumi.String("dbSecurityGroupId")),
	}

	resource.OpenSearchUser = stackRef.GetStringOutput(pulumi.String("OpenSearchUser"))
	resource.OpenSearchPassword = stackRef.GetStringOutput(pulumi.String("OpenSearchPassword"))
	resource.OpenSearchDomain = stackRef.GetStringOutput(pulumi.String("OpenSearchDomain"))
	resource.OpenSearchEndpoint = stackRef.GetStringOutput(pulumi.String("OpenSearchEndpoint"))

	// this SG protects the VPCEs created in the infrastructure stack
	resource.EndpointSecurityGroup = stackRef.GetStringOutput(pulumi.String("endpointSecurityGroupId"))

	// prefix list is needed for private connection to s3 (fargate control plane)
	resource.PrefixListId = stackRef.GetStringOutput(pulumi.String("s3EndpointPrefixId"))

	// provide defaults if needed
	resource.RecaptchaSecretKey = appConfig.Get("recaptchaSecretKey")
	if resource.RecaptchaSecretKey == "" {
		resource.RecaptchaSecretKey = "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe"
	}

	// provide defaults if needed
	resource.RecaptchaSiteKey = appConfig.Get("recaptchaSiteKey")
	if resource.RecaptchaSiteKey == "" {
		resource.RecaptchaSiteKey = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
	}

	// check if saml config is enabled
	resource.SamlArgs = &SamlArgs{
		Enabled: appConfig.GetBool("samlEnabled"),
	}

	if resource.SamlArgs.Enabled {
		// allow user to provide their own SAML certs, if they choose
		userProvidedPublicKey := appConfig.Get("samlCertPublicKey")
		userProvidedPrivateKey := appConfig.Get("samlCertPrivateKey")
		if userProvidedPublicKey != "" && userProvidedPrivateKey != "" {
			resource.SamlArgs.UserProvidedCerts = true
			resource.SamlArgs.CertPublicKey = pulumi.String(userProvidedPublicKey).ToStringOutput()
			resource.SamlArgs.CertPrivateKey = appConfig.RequireSecret("samlCertPrivateKey")
		}
	}

	// values will be used to construct URLs for API and UI (console) services
	// we only require the route53 zone, the subdomain is optional
	resource.Route53ZoneName = appConfig.Require("domainName")
	resource.Route53Subdomain = appConfig.Get("subdomainName")

	// allow a provided white list of cidrs to be applied on the public load balancer
	// we assume 0.0.0.0/0 if none is provided
	appConfig.GetObject("whiteListCideBlocks", &resource.WhiteListCidrBlocks)

	// gather values for our API and UI (console) services
	hydrateApiValues(appConfig, &resource)
	hydrateConsoleValues(appConfig, &resource)

	// hydrateInsightsValues(appConfig, &resource)

	// only populate our SMTP config if required values are present
	smtpServer := appConfig.Get("smtpServer")
	smtpUsername := appConfig.Get("smtpUsername")
	smtpGenericSender := appConfig.Get("smtpGenericSender")
	if smtpServer != "" && smtpUsername != "" && smtpGenericSender != "" {
		resource.SmtpArgs = &SmtpArgs{
			Server:        smtpServer,
			Username:      smtpUsername,
			GenericSender: smtpGenericSender,
			Password:      appConfig.RequireSecret("smtpPassword"),
		}
	}

	resource.LogType = log.LogType(appConfig.GetFloat64("logType"))
	resource.LogArgs = appConfig.Get("logArgs")

	return &resource, nil
}

type ConfigArgs struct {
	// AWS Values
	Region    string
	Profile   string
	AccountId string

	// Project Values
	ProjectName string
	StackName   string

	// Pre-Existing AWS Resources
	AcmCertificateArn     string
	KmsServiceKeyId       string
	LicenseKey            string
	VpcId                 pulumi.StringOutput
	PublicSubnetIds       pulumi.StringArrayOutput
	PrivateSubnetIds      pulumi.StringArrayOutput
	IsolatedSubnetIds     pulumi.StringArrayOutput
	DatabaseArgs          *DatabaseArgs
	EndpointSecurityGroup pulumi.StringOutput
	PrefixListId          pulumi.StringOutput

	ImagePrefix        string
	ImageTag           string
	RecaptchaSiteKey   string
	RecaptchaSecretKey string
	EcrRepoAccountId   string

	Route53ZoneName     string
	Route53Subdomain    string
	WhiteListCidrBlocks []string

	EnablePrivateLoadBalancerAndLimitEgress bool

	// API Related Values
	ApiDesiredNumberTasks         int
	ApiTaskMemory                 int
	ApiTaskCpu                    int
	ApiContainerCpu               int
	ApiContainerMemoryReservation int
	ApiDisableEmailLogin          bool
	ApiDisableEmailSign           bool
	ApiExecuteMigrations          bool

	// Console Related Values
	ConsoleDesiredNumberTasks         int
	ConsoleTaskMemory                 int
	ConsoleTaskCpu                    int
	ConsoleContainerCpu               int
	ConsoleContainerMemoryReservation int
	ConsoleHideEmailLogin             bool
	ConsoleHideEmailSignup            bool

	// Insights Related Values
	OpenSearchUser     pulumi.StringOutput
	OpenSearchPassword pulumi.StringOutput
	OpenSearchDomain   pulumi.StringOutput
	OpenSearchEndpoint pulumi.StringOutput

	// Configuration for Both
	SamlArgs *SamlArgs
	SmtpArgs *SmtpArgs

	LogType log.LogType
	LogArgs string
}

// func hydrateInsightsValues(appConfig *config.Config, resource *ConfigArgs) {
// 	resource.OpenSearchInstanceType = appConfig.Get("OpenSearchInstanceType")
// 	if resource.OpenSearchInstanceType == "" {
// 		resource.OpenSearchInstanceType = "t3.medium.search"
// 	}

// 	resource.OpenSearchInstanceCount = appConfig.GetInt("OpenSearchInstanceCount")
// 	if resource.OpenSearchInstanceCount == 0 {
// 		resource.OpenSearchInstanceCount = 2
// 	}

// 	resource.OpenSearchVolumeSize = appConfig.GetInt("OpenSearchVolumeSize")
// 	if resource.OpenSearchVolumeSize == 0 {
// 		resource.OpenSearchVolumeSize = 10
// 	}

// 	resource.OpenSearchDashboardsMemory = appConfig.GetInt("OpenSearchDashboardsMemory")
// 	if resource.OpenSearchDashboardsMemory == 0 {
// 		resource.OpenSearchDashboardsMemory = 512
// 	}

// 	resource.OpenSearchDashboardsCpu = appConfig.GetInt("OpenSearchDashboardsCpu")
// 	if resource.OpenSearchDashboardsCpu == 0 {
// 		resource.OpenSearchDashboardsCpu = 256
// 	}
// }

func hydrateApiValues(appConfig *config.Config, resource *ConfigArgs) {
	resource.ApiDesiredNumberTasks = appConfig.GetInt("apiDesiredNumberTasks")
	if resource.ApiDesiredNumberTasks == 0 {
		resource.ApiDesiredNumberTasks = 1
	}

	resource.ApiTaskMemory = appConfig.GetInt("apiTaskMemory")
	if resource.ApiTaskMemory == 0 {
		resource.ApiTaskMemory = 512
	}

	resource.ApiTaskCpu = appConfig.GetInt("apiTaskCpu")
	if resource.ApiTaskCpu == 0 {
		resource.ApiTaskCpu = 256
	}

	resource.ApiContainerCpu = appConfig.GetInt("apiContainerCpu")
	if resource.ApiContainerCpu == 0 {
		resource.ApiContainerCpu = 256
	}

	resource.ApiContainerMemoryReservation = appConfig.GetInt("apiContainerMemoryReservation")
	if resource.ApiContainerMemoryReservation == 0 {
		resource.ApiContainerMemoryReservation = 512
	}

	executeMigrations, ok := os.LookupEnv("PULUMI_EXECUTE_MIGRATIONS")
	if !ok {
		resource.ApiExecuteMigrations = true
	} else {
		resource.ApiExecuteMigrations, _ = strconv.ParseBool(executeMigrations)
	}
}

func hydrateConsoleValues(appConfig *config.Config, resource *ConfigArgs) {
	resource.ConsoleDesiredNumberTasks = appConfig.GetInt("consoleDesiredNumberTasks")
	if resource.ConsoleDesiredNumberTasks == 0 {
		resource.ConsoleDesiredNumberTasks = 1
	}

	resource.ConsoleTaskMemory = appConfig.GetInt("consoleTaskMemory")
	if resource.ConsoleTaskMemory == 0 {
		resource.ConsoleTaskMemory = 512
	}

	resource.ConsoleTaskCpu = appConfig.GetInt("consoleTaskCpu")
	if resource.ConsoleTaskCpu == 0 {
		resource.ConsoleTaskCpu = 256
	}

	resource.ConsoleContainerCpu = appConfig.GetInt("consoleContainerCpu")
	if resource.ConsoleContainerCpu == 0 {
		resource.ConsoleContainerCpu = 256
	}

	resource.ConsoleContainerMemoryReservation = appConfig.GetInt("consoleContainerMemoryReservation")
	if resource.ConsoleContainerMemoryReservation == 0 {
		resource.ConsoleContainerMemoryReservation = 512
	}
}

func OutputToStringArray(output pulumi.AnyOutput) pulumi.StringArrayOutput {
	return output.ApplyT(func(out any) []string {
		var res []string
		if out != nil {
			for _, v := range out.([]any) {
				res = append(res, v.(string))
			}
		}
		return res
	}).(pulumi.StringArrayOutput)
}

type DatabaseArgs struct {
	ClusterEndpoint pulumi.StringOutput
	Username        pulumi.StringOutput
	Password        pulumi.StringOutput
	Name            pulumi.StringOutput
	SecurityGroupId pulumi.StringOutput
	Port            pulumi.IntOutput
}

type SmtpArgs struct {
	Server        string
	Username      string
	Password      pulumi.StringOutput
	GenericSender string
}

type SamlArgs struct {
	Enabled           bool
	UserProvidedCerts bool
	CertPublicKey     pulumi.StringOutput
	CertPrivateKey    pulumi.StringOutput
}
