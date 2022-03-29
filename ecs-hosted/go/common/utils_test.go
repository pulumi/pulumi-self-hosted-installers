package common

import (
	"strings"
	"testing"
)

func TestUsGovPolicyArn(t *testing.T) {
	// US GOV WEST test
	region := "us-gov-west-1"
	policy := "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"

	res := GetIamPolicyArn(region, policy)
	if !strings.HasPrefix(res, "arn:aws-us-gov:") {
		t.Fatalf("Policy ARN should constart start with 'arn:aws-us-gov'")
	}

	// US GOV EAST test
	region = "us-gov-east-1"
	res = GetIamPolicyArn(region, policy)
	if !strings.HasPrefix(res, "arn:aws-us-gov:") {
		t.Fatalf("Policy ARN should start with 'arn:aws-us-gov'")
	}
}

func TestChinaPolicyArn(t *testing.T) {
	// Beijing test
	region := "cn-north-1"
	policy := "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"

	res := GetIamPolicyArn(region, policy)
	if !strings.HasPrefix(res, "arn:aws-cn:") {
		t.Fatalf("Policy ARN should start with 'arn:aws-cn'")
	}

	// Ningxia test
	region = "cn-northwest-1"
	res = GetIamPolicyArn(region, policy)
	if !strings.HasPrefix(res, "arn:aws-cn:") {
		t.Fatalf("Policy ARN should start with 'arn:aws-cn'")
	}
}

func TestGenericRegionArn(t *testing.T) {
	// US WEST 2 test
	region := "us-west-2"
	policy := "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"

	res := GetIamPolicyArn(region, policy)
	if !strings.HasPrefix(res, "arn:aws:") {
		t.Fatalf("Policy ARN should start with 'aws-gov'")
	}

	// US EAST 1 test
	region = "us-east-2"
	res = GetIamPolicyArn(region, policy)
	if !strings.HasPrefix(res, "arn:aws:") {
		t.Fatalf("Policy ARN should start with 'aws-gov'")
	}
}

func TestChinaEndpoint(t *testing.T) {
	// Beijing test
	region := "cn-north-1"
	endpoint := "apigateway.cn-northwest-1.amazonaws.com"

	res := GetEnpointAddress(region, endpoint)
	if !strings.HasSuffix(res, ".cn") {
		t.Fatalf("Endpoint address should end with '.cn'")
	}
}
