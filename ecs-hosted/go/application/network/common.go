package network

import (
	"strings"
)

// GetIamPolicyArn adjusts IAM policy ARNs for different AWS partitions
func GetIamPolicyArn(region string, policyArn string) string {
	policy := policyArn
	regionLower := strings.ToLower(region)

	if strings.HasPrefix(regionLower, "us-gov-") {
		// all us gov regions
		splits := strings.Split(policy, ":")
		splits[1] = "aws-us-gov"

		policy = strings.Join(splits, ":")
	} else if strings.HasPrefix(regionLower, "cn-") {
		// all china regions
		splits := strings.Split(policy, ":")
		splits[1] = "aws-cn"

		policy = strings.Join(splits, ":")
	}

	return policy
}