package common

import (
	"fmt"
	"strings"
)

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

func GetEnpointAddress(region string, endpoint string) string {
	regionLower := strings.ToLower(region)
	endpointAddress := endpoint

	if strings.HasPrefix(regionLower, "cn-") {
		// china enpoints all follow the {service}.{region}.amazonaws.com.cn
		// we append "cn" to allow this to function
		endpointAddress = fmt.Sprintf("%s.cn", endpoint)
	}

	return endpointAddress
}
