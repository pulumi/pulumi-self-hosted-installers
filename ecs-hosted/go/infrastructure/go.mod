module github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/infrastructure

go 1.14

require (
	github.com/pulumi/pulumi-aws/sdk/v4 v4.30.0
	github.com/pulumi/pulumi-random/sdk/v4 v4.3.1
	github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/common v0.0.0-00010101000000-000000000000
	github.com/pulumi/pulumi/sdk/v3 v3.22.1
)

replace github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/common => ../common

replace github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/go/infrastructure => ./ecs-hosted/go/infrastructure
