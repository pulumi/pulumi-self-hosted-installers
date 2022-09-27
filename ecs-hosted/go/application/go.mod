module github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/application

go 1.14

require (
	github.com/aws/aws-sdk-go-v2 v1.13.0
	github.com/aws/aws-sdk-go-v2/config v1.13.1
	github.com/aws/aws-sdk-go-v2/service/ecs v1.16.0
	github.com/pulumi/pulumi-aws/sdk/v4 v4.30.0
	github.com/pulumi/pulumi-tls/sdk/v4 v4.1.0
	github.com/pulumi/pulumi/sdk/v3 v3.19.0
	github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/common v0.0.0-00010101000000-000000000000
)

replace github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/common => ../common

replace github.com/pulumi/self-hosted/fully-managed-aws-ecs/application/types => ./types
