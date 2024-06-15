package cli

import (
	"log"

	"cuelang.org/go/cue"
	tea "github.com/charmbracelet/bubbletea"
)

func PlatformSelectionModel(provider string) {
	// Example CUE logic to get platform options based on provider
	var r cue.Runtime
	instance, err := r.Compile("", `
		providers: {
			aws: ["EKS", "Fargate"]
			azure: ["AKS"]
		}
	`)
	if err != nil {
		log.Fatalf("Failed to compile CUE: %v", err)
	}

	platforms := make(map[string]string)
	iter, _ := instance.Lookup("providers", provider).List()
	for iter.Next() {
		platform, _ := iter.Value().String()
		platforms[platform] = platform
	}

	model := NewGenericSelectionModel("Select a Platform", "Choose a platform for deployment", platforms)
	p := tea.NewProgram(&model)
	if err := p.Start(); err != nil {
		log.Fatalf("Failed to start program: %v", err)
	}

	log.Printf("Selected Platform: %s", model.selectedItem)
}
