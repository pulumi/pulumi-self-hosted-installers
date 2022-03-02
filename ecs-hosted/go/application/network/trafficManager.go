package network

import (
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/elb"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/s3"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/self-hosted/fully-managed-aws-ecs/common"
)

func NewTrafficManager(ctx *pulumi.Context, name string, args *LoadBalancerArgs, opts ...pulumi.ResourceOption) (*TrafficManager, error) {
	var resource TrafficManager

	err := ctx.RegisterComponentResource("pulumi:trafficManager", name, &resource, opts...)
	if err != nil {
		return nil, err
	}

	// create our parented options
	options := append(opts, pulumi.Parent(&resource))

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
	consoleLoadBalancerArgs := newLoadBalancerArgs(args, accessLogsBucket, prefix)

	apiName := fmt.Sprintf("%s-api", name)
	consoleName := fmt.Sprintf("%s-console", name)

	resource.Api, err = NewPulumiLoadBalancer(ctx, apiName, apiLoadBalancerArgs, options...)
	if err != nil {
		return nil, err
	}

	resource.Console, err = NewPulumiLoadBalancer(ctx, consoleName, consoleLoadBalancerArgs, options...)
	if err != nil {
		return nil, err
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
		InternalLb:          args.InternalLb,
		PublicSubnetIds:     args.PublicSubnetIds,
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

	Api     *PulumiLoadBalancer
	Console *PulumiLoadBalancer
}
