package cli

import (
	"log"

	"cuelang.org/go/cue"
	tea "github.com/charmbracelet/bubbletea"
)

func ProviderSelectionModel() {
	// Example CUE logic to get provider options
	var r cue.Runtime
	instance, err := r.Compile("", `
		providers: {
			aws: "Amazon Web Services"
			azure: "Microsoft Azure"
		}
	`)
	if err != nil {
		log.Fatalf("Failed to compile CUE: %v", err)
	}

	providers := make(map[string]string)
	iter, _ := instance.Lookup("providers").Fields()
	for iter.Next() {
		name, err := iter.Value().String()
		if err != nil {
			log.Printf("Error fetching name: %v\n", err)
		}
		providers[iter.Label()] = name
	}

	model := NewGenericSelectionModel("Select a Provider", "Choose a cloud provider", providers)
	p := tea.NewProgram(&model)
	if err := p.Start(); err != nil {
		log.Fatalf("Failed to start program: %v", err)
	}

	log.Printf("Selected Provider: %s", model.selectedItem)
}
