package integration

import (
	"testing"
)

func TestEcsInfrastructure(t *testing.T) {
	config := map[string]string{
		"aws:region":        "us-west-2",
		"aws:profile":       "pulumi-ce",
		"privateSubnetIds":  "[\"subnet-0b37fe5c977a05bcd\",\"subnet-0444dfef3dd964a67\",\"subnet-042b2ee4fa243b803\"]",
		"isolatedSubnetIds": "[\"subnet-0d5002baba66b143b\",\"subnet-03b0984123a860832\",\"subnet-02bcb6ef3802ea03c\"]",
		"publicSubnetIds":   "[\"subnet-00698caf960727125\",\"subnet-0597252b8c8b60df2\",\"subnet-0da071a98dd3b799e\"]",
		"vpcId":             "vpc-0918691abc4afcd13",
	}

	IntegrationProgram(t, "ecs", config, nil)
}
