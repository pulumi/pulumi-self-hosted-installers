package network

import (
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/elb"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/s3"
	"github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/common"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

/*
Current State:
1 ALB fronts both UI and API ECS fargate services
- listener and target group for each service

Future:
1 ALB
- traffic direct to UI
- traffic to intermediate NLB which (for api) which fronts API (static IP)
*/

func NewTrafficManager(ctx *pulumi.Context, name string, args *LoadBalancerArgs, opts ...pulumi.ResourceOption) (*TrafficManager, error) {
	var resource TrafficManager

	err := ctx.RegisterComponentResource("pulumi:trafficManager", name, &resource, opts...)
	if err != nil {
		return nil, err
	}

	// create our parented options
	options := append(opts, pulumi.Parent(&resource))

	// only create an access log s3 bucket if enabled
	// default is false
	var accessLogsBucket *s3.Bucket
	prefix := "pulumi-elb"
	if args.EnabledAccessLogs {
		ctx.Log.Debug("creating load balancer access logs s3 bucket", nil)
		accessLogsBucket, err = newAccessLogBucket(ctx, args.Region, name, prefix, args.AccountId, options...)
	}

	if err != nil {
		return nil, err
	}

	apiLoadBalancerArgs := newLoadBalancerArgs(args, accessLogsBucket, prefix)
	apiName := fmt.Sprintf("%s-api", name)

	resource.Public, err = NewPulumiLoadBalancer(ctx, apiName, apiLoadBalancerArgs, options...)
	if err != nil {
		return nil, err
	}

	// we will not enable private LB be default
	// this will be used to allow console to route traffic to api, without public internet routeability
	// UI SG will be locked down to not allow 0.0.0.0/0 egress and will target an internal NLB directly
	if args.EnabledPrivateLoadBalancer {
		internalLoadBalancerArgs := newLoadBalancerArgs(args, nil, prefix)
		internalName := fmt.Sprintf("%s-internal", name)

		resource.Internal, err = NewPulumiInternalLoadBalancer(ctx, internalName, internalLoadBalancerArgs, options...)
		if err != nil {
			return nil, err
		}
	}

	return &resource, nil
}

func newLoadBalancerArgs(args *LoadBalancerArgs, bucket *s3.Bucket, prefix string) *LoadBalancerArgs {
	return &LoadBalancerArgs{
		AccessLogsBucket:    bucket,
		AccessLogsPrefix:    prefix,
		AccountId:           args.AccountId,
		CertificateArn:      args.CertificateArn,
		EnabledAccessLogs:   args.EnabledAccessLogs,
		IdleTimeout:         args.IdleTimeout,
		PublicSubnetIds:     args.PublicSubnetIds,
		PrivateSubnetIds:    args.PrivateSubnetIds,
		Region:              args.Region,
		VpcId:               args.VpcId,
		WhiteListCidrBlocks: args.WhiteListCidrBlocks,
	}
}

func newAccessLogBucket(ctx *pulumi.Context, region string, name string, prefix string, accountId string, opts ...pulumi.ResourceOption) (*s3.Bucket, error) {
	options := append(opts, pulumi.Protect(true))
	bucketName := fmt.Sprintf("%s-access-logs", name)

	accessLogsBucket, err := s3.NewBucket(ctx, bucketName, &s3.BucketArgs{}, options...)
	if err != nil {
		return accessLogsBucket, err
	}

	serviceAccount, err := elb.GetServiceAccount(ctx, &elb.GetServiceAccountArgs{})
	if err != nil {
		return accessLogsBucket, err
	}

	policy := pulumi.All(accessLogsBucket.ID(), serviceAccount, accountId).ApplyT(
		func(args []interface{}) (string, error) {
			accessLogsBucketId := args[0].(string)
			serviceAccount := args[1].(elb.GetServiceAccountResult)
			accountId := args[2].(string)

			nonRegionArn := fmt.Sprintf("arn:aws:s3:::%s/%s/AWSLogs/%s/*", accessLogsBucketId, prefix, accountId)
			accessBucketArn := common.GetIamPolicyArn(region, nonRegionArn)

			return fmt.Sprintf(`{
				"Version": "2012-10-17",
				"Statement": [{
					"Sid": "",
					"Effect": "Allow",
					"Principal": {
						"AWS": "%s"
					},
					"Action": "s3:PutObject",
					"Resource": "%s"
				}]
			}`, serviceAccount.Arn, accessBucketArn), nil
		},
	)

	_, err = s3.NewBucketPolicy(ctx, "access-logs-bucket-policy", &s3.BucketPolicyArgs{
		Bucket: accessLogsBucket.ID(),
		Policy: policy,
	}, options...)

	if err != nil {
		return nil, err
	}

	return accessLogsBucket, nil
}

type TrafficManager struct {
	pulumi.ResourceState

	Public   *PulumiLoadBalancer
	Internal *PulumiInternalLoadBalancer
}
