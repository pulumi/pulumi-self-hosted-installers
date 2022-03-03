package common

import (
	"strings"
)

func GetIamPolicyArn(region string, policyArn string) string {
	policy := policyArn

	regionLower := strings.ToLower(region)
	if regionLower == "us-gov-west-1" || regionLower == "us-gov-east-1" {
		splits := strings.Split(":", region)
		splits[1] = "aws-us-gov"

		policy = strings.Join(splits, ":")
	}

	return policy
}
