package main

import (
	"fmt"
)

func ToCommonName(first string, second string) string {
	return fmt.Sprintf("%s-%s", first, second)
}
