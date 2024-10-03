package service

import (
	"fmt"
	"strings"

	"github.com/pulumi/pulumi-aws/sdk/v6/go/aws/secretsmanager"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

/*
Allow a caller to create secrets in AWS SecretsManager
*/
func NewSecrets(ctx *pulumi.Context, name string, args *SecretsArgs, opts ...pulumi.ResourceOption) (*SecretsOutput, error) {
	var resource SecretsOutput

	err := ctx.RegisterComponentResource("pulumi:secretsManager", name, &resource, opts...)
	if err != nil {
		return nil, err
	}

	// create our parented options
	options := append(opts, pulumi.Parent(&resource))

	var outputs []map[string]any

	for _, s := range args.Secrets {
		secretName := strings.ToLower(s.Name)

		secret, err := secretsmanager.NewSecret(ctx, fmt.Sprintf("%s-%s", name, secretName), &secretsmanager.SecretArgs{
			NamePrefix: pulumi.String(fmt.Sprintf("%s/%s", args.Prefix, secretName)),
			KmsKeyId:   pulumi.String(args.KmsKeyId),
		}, options...)

		if err != nil {
			return nil, err
		}

		_, err = secretsmanager.NewSecretVersion(ctx, secretName, &secretsmanager.SecretVersionArgs{
			SecretId:     secret.ID(),
			SecretString: s.Value,
		})

		if err != nil {
			return nil, err
		}

		outputs = append(outputs, map[string]any{
			"name":      s.Name,
			"valueFrom": secret.Arn,
		})
	}

	resource.Secrets = outputs

	return &resource, nil
}
