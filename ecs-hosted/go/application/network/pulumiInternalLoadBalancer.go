package network

import (
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/lb"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

/*
Create a internal (non-internet routable) NLB that will reside in a private subnet and be used to provide static IP address endpoint for our API
*/
func NewPulumiInternalLoadBalancer(ctx *pulumi.Context, name string, args *LoadBalancerArgs, opts ...pulumi.ResourceOption) (*PulumiInternalLoadBalancer, error) {
	var resource PulumiInternalLoadBalancer

	err := ctx.RegisterComponentResource("pulumi:internalLoadBalancer", name, &resource, opts...)
	if err != nil {
		return nil, err
	}

	// create our parented options
	options := append(opts, pulumi.Parent(&resource), pulumi.DeleteBeforeReplace(true))

	lbName := fmt.Sprintf("%s-lb", name)
	resource.LoadBalancer, err = lb.NewLoadBalancer(ctx, lbName, &lb.LoadBalancerArgs{
		LoadBalancerType: pulumi.String("network"),
		Internal:         pulumi.Bool(true),
		Subnets:          args.PrivateSubnetIds,
		IdleTimeout:      pulumi.Int(args.IdleTimeout),
		IpAddressType:    pulumi.String("ipv4"),
	}, options...)

	if err != nil {
		return nil, err
	}

	return &resource, nil
}

func (l *PulumiInternalLoadBalancer) CreateListener(ctx *pulumi.Context, name string, tgArn pulumi.StringOutput, certArn string, opts ...pulumi.ResourceOption) (*lb.Listener, error) {

	args := &lb.ListenerArgs{
		LoadBalancerArn: l.LoadBalancer.Arn,
		Port:            pulumi.Int(80),
		Protocol:        pulumi.String("TCP"),
		DefaultActions: &lb.ListenerDefaultActionArray{
			lb.ListenerDefaultActionArgs{
				TargetGroupArn: tgArn,
				Type:           pulumi.String("forward"),
			},
		},
	}

	if certArn != "" {
		args.CertificateArn = pulumi.String(certArn)
		args.SslPolicy = pulumi.String("ELBSecurityPolicy-TLS-1-2-2017-01")
		args.Protocol = pulumi.String("TLS")
		args.Port = pulumi.Int(443)
	}

	listOpts := append(opts, pulumi.DeleteBeforeReplace(true))
	listener, err := lb.NewListener(ctx, fmt.Sprintf("%s-listener", name), args, listOpts...)

	if err != nil {
		return nil, err
	}

	return listener, nil
}

func (l *PulumiInternalLoadBalancer) AttachLoadBalancer(ctx *pulumi.Context, name string, tgArn pulumi.StringOutput, opts ...pulumi.ResourceOption) error {

	return nil
}

type PulumiInternalLoadBalancer struct {
	pulumi.ResourceState

	LoadBalancer *lb.LoadBalancer
}
