package network

import (
	"fmt"

	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/ec2"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/lb"
	"github.com/pulumi/pulumi-aws/sdk/v4/go/aws/s3"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func NewPulumiLoadBalancer(ctx *pulumi.Context, name string, args *LoadBalancerArgs, opts ...pulumi.ResourceOption) (*PulumiLoadBalancer, error) {
	var resource PulumiLoadBalancer

	err := ctx.RegisterComponentResource("pulumi:loadBalancer", name, &resource, opts...)
	if err != nil {
		return nil, err
	}

	// create our parented options
	options := append(opts, pulumi.Parent(&resource))

	whiteList := args.WhiteListCidrBlocks
	if len(args.WhiteListCidrBlocks) <= 0 {
		ctx.Log.Debug("no configured white list restritions found. Default 0.0.0.0/ to be used", nil)
		whiteList = []string{"0.0.0.0/0"}
	}

	sgName := fmt.Sprintf("%s-lb-sg", name)
	resource.SecurityGroup, err = ec2.NewSecurityGroup(ctx, sgName, &ec2.SecurityGroupArgs{
		Description: pulumi.String("ELB Security Group"),
		VpcId:       args.VpcId,
		Ingress: ec2.SecurityGroupIngressArray{
			ec2.SecurityGroupIngressArgs{
				FromPort:   pulumi.Int(80),
				ToPort:     pulumi.Int(80),
				Protocol:   pulumi.String("TCP"),
				CidrBlocks: pulumi.ToStringArray(whiteList),
			},
			ec2.SecurityGroupIngressArgs{
				FromPort:   pulumi.Int(443),
				ToPort:     pulumi.Int(443),
				Protocol:   pulumi.String("TCP"),
				CidrBlocks: pulumi.ToStringArray(whiteList),
			},
		},
	}, options...)

	if err != nil {
		return nil, err
	}

	lbName := fmt.Sprintf("%s-lb", name)
	lbArgs := &lb.LoadBalancerArgs{
		LoadBalancerType: pulumi.String("application"),
		Internal:         pulumi.Bool(args.InternalLb),
		SecurityGroups:   pulumi.StringArray{resource.SecurityGroup.ID()},
		Subnets:          args.PublicSubnetIds,
		IdleTimeout:      pulumi.Int(args.IdleTimeout),
	}

	if args.EnabledAccessLogs {
		ctx.Log.Debug("enabling load balancer access logs", nil)
		lbArgs.AccessLogs = &lb.LoadBalancerAccessLogsArgs{
			Enabled: pulumi.Bool(true),
			Bucket:  args.AccessLogsBucket.ID(),
			Prefix:  pulumi.String(args.AccessLogsPrefix),
		}
	}

	resource.LoadBalancer, err = lb.NewLoadBalancer(ctx, lbName, lbArgs, options...)

	if err != nil {
		return nil, err
	}

	tgName := fmt.Sprintf("%s-tg", name)
	emptyTargetGroup, err := lb.NewTargetGroup(ctx, tgName, &lb.TargetGroupArgs{
		Port:     pulumi.Int(80),
		Protocol: pulumi.String("HTTP"),
		VpcId:    args.VpcId,
	}, options...)

	if err != nil {
		return nil, err
	}

	httpName := fmt.Sprintf("%s-http-listener", name)
	resource.HttpListener, err = lb.NewListener(ctx, httpName, &lb.ListenerArgs{
		LoadBalancerArn: resource.LoadBalancer.Arn,
		Port:            pulumi.Int(80),
		Protocol:        pulumi.String("HTTP"),
		DefaultActions: &lb.ListenerDefaultActionArray{
			lb.ListenerDefaultActionArgs{
				TargetGroupArn: emptyTargetGroup.Arn,
				Type:           pulumi.String("fixed-response"),
				FixedResponse: lb.ListenerDefaultActionFixedResponseArgs{
					StatusCode:  pulumi.String("204"),
					ContentType: pulumi.String("text/plain"),
				},
			},
		},
	}, options...)

	if err != nil {
		return nil, err
	}

	httpsName := fmt.Sprintf("%s-https-listener", name)
	resource.HttpsListener, err = lb.NewListener(ctx, httpsName, &lb.ListenerArgs{
		LoadBalancerArn: resource.LoadBalancer.Arn,
		Port:            pulumi.Int(443),
		Protocol:        pulumi.String("HTTPS"),
		CertificateArn:  pulumi.String(args.CertificateArn),
		SslPolicy:       pulumi.String("ELBSecurityPolicy-TLS-1-2-2017-01"),
		DefaultActions: &lb.ListenerDefaultActionArray{
			lb.ListenerDefaultActionArgs{
				TargetGroupArn: emptyTargetGroup.Arn,
				Type:           pulumi.String("fixed-response"),
				FixedResponse: lb.ListenerDefaultActionFixedResponseArgs{
					StatusCode:  pulumi.String("204"),
					ContentType: pulumi.String("text/plain"),
				},
			},
		},
	}, options...)

	if err != nil {
		return nil, err
	}

	return &resource, nil
}

type PulumiLoadBalancer struct {
	pulumi.ResourceState

	LoadBalancer  *lb.LoadBalancer
	HttpsListener *lb.Listener
	HttpListener  *lb.Listener
	SecurityGroup *ec2.SecurityGroup
}

type LoadBalancerArgs struct {
	AccessLogsBucket    *s3.Bucket
	AccessLogsPrefix    string
	AccountId           string
	CertificateArn      string
	EnabledAccessLogs   bool
	IdleTimeout         int32
	InternalLb          bool
	PublicSubnetIds     pulumi.StringArrayOutput
	Region              string
	VpcId               pulumi.StringOutput
	WhiteListCidrBlocks []string
}
