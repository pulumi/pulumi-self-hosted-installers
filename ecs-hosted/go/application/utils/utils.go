package utils

import (
	"fmt"
)

func NewEcrImageTag(accountId string, region string, imageName string) string {
	return fmt.Sprintf("%s.dkr.ecr.%s.amazonaws.com/%s", accountId, region, imageName)
}
