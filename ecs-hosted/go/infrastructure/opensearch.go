package main

import (
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/opensearch"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

type OpenSearchArgs struct {
	DeployOpenSearch bool
	InstanceType     string
	InstanceCount    int
}

func NewOpenSearch(ctx *pulumi.Context, name string, args *OpenSearchArgs, opts ...pulumi.ResourceOption) (*opensearch.Domain, error) {
	if !args.DeployOpenSearch {
		return nil, nil
	}

	domain, err := opensearch.NewDomain(ctx, name, &opensearch.DomainArgs{
		ClusterConfig: &opensearch.DomainClusterConfigArgs{
			InstanceType:  pulumi.String(args.InstanceType),
			InstanceCount: pulumi.Int(args.InstanceCount),
		},
	}, opts...)
	if err != nil {
		return nil, err
	}

	return domain, nil
}
