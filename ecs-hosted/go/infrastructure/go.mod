module github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/infrastructure

go 1.14

require (
	github.com/gogo/protobuf v1.3.2 // indirect
	github.com/golang/protobuf v1.4.3 // indirect
	github.com/google/go-cmp v0.5.4 // indirect
	github.com/pulumi/pulumi-aws/sdk/v4 v4.30.0
	github.com/pulumi/pulumi-random/sdk/v4 v4.3.1
	github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/common v0.0.0-00010101000000-000000000000
	github.com/pulumi/pulumi/sdk/v3 v3.22.1
	github.com/spf13/pflag v1.0.5 // indirect
	golang.org/x/crypto v0.0.0-20210322153248-0c34fe9e7dc2 // indirect
	golang.org/x/text v0.3.4 // indirect
	google.golang.org/genproto v0.0.0-20201110150050-8816d57aaa9a // indirect
	google.golang.org/grpc v1.33.2 // indirect
	gopkg.in/yaml.v2 v2.4.0 // indirect
)

replace github.com/pulumi/pulumi-self-hosted-installers/ecs-hosted/common => ../common
