module github.com/pulumi/self-hosted/fully-managed-aws/ecs/infrastructure

go 1.14

require (
	github.com/pulumi/pulumi-aws/sdk/v4 v4.30.0
	github.com/pulumi/pulumi-random/sdk/v4 v4.3.1 // indirect
	github.com/pulumi/pulumi/sdk/v3 v3.22.1
	github.com/pulumi/self-hosted/fully-managed-aws-ecs/common v0.0.0-00010101000000-000000000000 // indirect
)

replace github.com/pulumi/self-hosted/fully-managed-aws-ecs/common => ../common
