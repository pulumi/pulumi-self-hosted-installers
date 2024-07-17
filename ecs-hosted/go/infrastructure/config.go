package main

import (
	"errors"

	"github.com/pulumi/pulumi-aws/sdk/v6/go/aws"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

type ConfigValues struct {
	Region                         string
	AccountId                      string
	ProjectName                    string
	CommonName                     string
	VpcId                          string
	Stack                          string
	NumberDbReplicas               int
	PublicSubnetIds                []string
	PrivateSubnetIds               []string
	IsolatedSubnetIds              []string
	DbInstanceType                 string
	BaseTags                       map[string]string
	UseOpenSearchContainer         bool
	DeployOpenSearch               bool
	OpenSearchInstanceType         string
	OpenSearchInstanceCount        int
	OpenSearchDomainName           string
	OpenSearchDedicatedMasterCount int
}

func NewConfig(ctx *pulumi.Context) (*ConfigValues, error) {
	var configValues ConfigValues

	caller, err := aws.GetCallerIdentity(ctx, nil, nil)
	if err != nil {
		return nil, err
	}

	// aws account id we are current deploying to
	configValues.AccountId = caller.AccountId

	project := ctx.Project()
	stackName := ctx.Stack()

	configValues.BaseTags = map[string]string{
		"project": project,
		"stack":   stackName,
	}

	configValues.ProjectName = ctx.Project()
	configValues.Stack = ctx.Stack()

	awsConfig := config.New(ctx, "aws")
	configValues.Region = awsConfig.Require("region")

	appConfig := config.New(ctx, "")
	configValues.CommonName = appConfig.Get("commonName")
	if configValues.CommonName == "" {
		configValues.CommonName = "pulumiselfhosted"
	}

	appConfig.RequireObject("publicSubnetIds", &configValues.PublicSubnetIds)
	appConfig.RequireObject("privateSubnetIds", &configValues.PrivateSubnetIds)
	appConfig.RequireObject("isolatedSubnetIds", &configValues.IsolatedSubnetIds)

	configValues.VpcId = appConfig.Require("vpcId")
	configValues.NumberDbReplicas = appConfig.GetInt("numberDbReplicas")
	if configValues.NumberDbReplicas > 2 || configValues.NumberDbReplicas < 0 {
		return nil, errors.New("db replicas cannot be greater than 2 or less than zero")
	}

	configValues.DbInstanceType = appConfig.Get("dbInstanceType")
	if configValues.DbInstanceType == "" {
		configValues.DbInstanceType = "db.t3.medium"
	}

	configValues.DeployOpenSearch = appConfig.GetBool("deployOpenSearch")
	configValues.OpenSearchInstanceType = appConfig.Get("opensearchInstanceType")
	if configValues.OpenSearchInstanceType == "" {
		configValues.OpenSearchInstanceType = "t3.medium.search"
	}
	configValues.OpenSearchInstanceCount = appConfig.GetInt("opensearchInstanceCount")
	if configValues.OpenSearchInstanceCount < 2 {
		configValues.OpenSearchInstanceCount = 2
	}
	configValues.OpenSearchDomainName = appConfig.Get("opensearchDomainName")
	if configValues.OpenSearchDomainName == "" {
		configValues.OpenSearchDomainName = "pulumi"
	}
	configValues.OpenSearchDedicatedMasterCount = appConfig.GetInt("opensearchDedicatedMasterCount")

	return &configValues, nil
}
