module github.com/pulumi/self-hosted/fully-managed-aws-ecs/application

go 1.14

require (
	github.com/aws/aws-sdk-go-v2 v1.13.0 // indirect
	github.com/aws/aws-sdk-go-v2/config v1.13.1 // indirect
	github.com/aws/aws-sdk-go-v2/service/ecs v1.16.0 // indirect
	github.com/awslabs/smithy-go v0.3.0 // indirect
	github.com/pulumi/pulumi-aws/sdk/v4 v4.30.0
	github.com/pulumi/pulumi/sdk/v3 v3.19.0
	github.com/pulumi/self-hosted/fully-managed-aws-ecs/common v0.0.0-00010101000000-000000000000
)

replace github.com/pulumi/self-hosted/fully-managed-aws-ecs/common => ../common

replace github.com/pulumi/self-hosted/fully-managed-aws-ecs/application/types => ./types
