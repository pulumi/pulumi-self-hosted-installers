package utils

import (
	"fmt"
)

func NewEcrImageTag(accountId string, region string, imageName string, imagePrefix string) string {
	if imagePrefix == "" {
		return fmt.Sprintf("%s.dkr.ecr.%s.amazonaws.com/%s", accountId, region, imageName)
	} else {
		return fmt.Sprintf("%s.dkr.ecr.%s.amazonaws.com/%s%s", accountId, region, imagePrefix, imageName)
	}
}
