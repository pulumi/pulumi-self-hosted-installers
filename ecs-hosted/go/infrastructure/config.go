package main

import (
	"errors"

	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

type ConfigValues struct {
	region            string
	projectName       string
	commonName        string
	vpcId             string
	stack             string
	numberDbReplicas  int
	publicSubnetIds   []string
	privateSubnetIds  []string
	isolatedSubnetIds []string
	dbInstanceType    string
	baseTags          map[string]string
	UseOpenSearchContainer bool
	DeployOpenSearch       bool
	OpenSearchInstanceType string
	OpenSearchInstanceCount int
}

func NewConfig(ctx *pulumi.Context) (*ConfigValues, error) {
	var configValues ConfigValues

	project := ctx.Project()
	stackName := ctx.Stack()

	configValues.baseTags = map[string]string{
		"project": project,
		"stack":   stackName,
	}

	configValues.projectName = ctx.Project()
	configValues.stack = ctx.Stack()

	awsConfig := config.New(ctx, "aws")
	configValues.region = awsConfig.Require("region")

	appConfig := config.New(ctx, "")
	configValues.commonName = appConfig.Get("commonName")
	if configValues.commonName == "" {
		configValues.commonName = "pulumiselfhosted"
	}

	appConfig.RequireObject("publicSubnetIds", &configValues.publicSubnetIds)
	appConfig.RequireObject("privateSubnetIds", &configValues.privateSubnetIds)
	appConfig.RequireObject("isolatedSubnetIds", &configValues.isolatedSubnetIds)

	configValues.vpcId = appConfig.Require("vpcId")
	configValues.numberDbReplicas = appConfig.GetInt("numberDbReplicas")
	if configValues.numberDbReplicas > 2 || configValues.numberDbReplicas < 0 {
		return nil, errors.New("db replicas cannot be greater than 2 or less than zero")
	}

	configValues.dbInstanceType = appConfig.Get("dbInstanceType")
	if configValues.dbInstanceType == "" {
		configValues.dbInstanceType = "db.t3.medium"
	}

	configValues.DeployOpenSearch = appConfig.GetBool("deployOpenSearch")
	configValues.OpenSearchInstanceType = appConfig.Get("opensearchInstanceType")
	if configValues.OpenSearchInstanceType == "" {
		configValues.OpenSearchInstanceType = "t3.medium.search"
	}
	configValues.OpenSearchInstanceCount = appConfig.GetInt("opensearchInstanceCount")
	if configValues.OpenSearchInstanceCount == 0 {
		configValues.OpenSearchInstanceCount = 1
	}

	return &configValues, nil
}
