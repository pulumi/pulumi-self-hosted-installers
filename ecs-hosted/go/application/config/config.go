package config

import (
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/application/log"
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

	// we require these values to be present in configuration (aka already created in AWS account)
	resource.AcmCertificateArn = appConfig.Require("acmCertificateArn")
	resource.KmsServiceKeyId = appConfig.Require("kmsServiceKeyId")
	resource.LicenseKey = appConfig.Require("licenseKey")
	resource.ImageTag = appConfig.Require("imageTag")

	// if not present, we assume ECR repo is present in our "current" AWS account
	resource.EcrRepoAccountId = appConfig.Get("ecrRepoAccountId")

	// baseStack == infrastructure stack
	stackRef, err := pulumi.NewStackReference(ctx, appConfig.Require("baseStackReference"), nil)
	if err != nil {
		return nil, err
	}

	// retrieve database and VPC output values from the infrastack
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

	// this SG protects the VPCEs created in the infrastructure stack
	resource.EndpointSecurityGroup = stackRef.GetStringOutput(pulumi.String("endpointSecurityGroup"))

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

	// require the samlCertPrivate key secret only if Public Key is present
	samlCertPublicKey := appConfig.Get("samlCertPublicKey")
	if samlCertPublicKey != "" {
		resource.SamlArgs = &SamlArgs{
			CertPublicKey:  samlCertPublicKey,
			CertPrivateKey: appConfig.RequireSecret("samlCertPrivateKey"),
		}
	}

	// values will be used to construct URLs for API and UI (console) services
	resource.Route53ZoneName = appConfig.Require("route53ZoneName")
	resource.Route53Subdomain = appConfig.Get("route53Subdomain")

	appConfig.GetObject("whiteListCideBlocks", &resource.WhiteListCidrBlocks)

	// gather values for our API and UI (console) services
	hydrateApiValues(appConfig, &resource)
	hydrateConsoleValues(appConfig, &resource)

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

	// TODO: log args

	return &resource, nil
}

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
	return output.ApplyT(func(out interface{}) []string {
		var res []string
		if out != nil {
			for _, v := range out.([]interface{}) {
				res = append(res, v.(string))
			}
		}
		return res
	}).(pulumi.StringArrayOutput)
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

	ImageTag           string
	RecaptchaSiteKey   string
	RecaptchaSecretKey string
	EcrRepoAccountId   string

	Route53ZoneName     string
	Route53Subdomain    string
	WhiteListCidrBlocks []string

	// API Related Values
	ApiDesiredNumberTasks         int
	ApiTaskMemory                 int
	ApiTaskCpu                    int
	ApiContainerCpu               int
	ApiContainerMemoryReservation int
	ApiDisableEmailLogin          bool
	ApiDisableEmailSign           bool

	// Console Related Values
	ConsoleDesiredNumberTasks         int
	ConsoleTaskMemory                 int
	ConsoleTaskCpu                    int
	ConsoleContainerCpu               int
	ConsoleContainerMemoryReservation int
	ConsoleHideEmailLogin             bool
	ConsoleHideEmailSignup            bool

	// Configuration for Both
	SamlArgs *SamlArgs
	SmtpArgs *SmtpArgs

	LogType log.LogType
	LogArgs string
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
	CertPublicKey  string
	CertPrivateKey pulumi.StringOutput
}
