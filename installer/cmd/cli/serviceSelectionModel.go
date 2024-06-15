package cli

import (
	"log"

	"cuelang.org/go/cue"
	tea "github.com/charmbracelet/bubbletea"
)

func ServiceSelectionModel() {
	// Example CUE logic to get service options
	var r cue.Runtime
	instance, err := r.Compile("", `
		services: {
			web: "containerImage"
			db: "containerImage"
		}
	`)
	if err != nil {
		log.Fatalf("Failed to compile CUE: %v", err)
	}

	services := make(map[string]string)
	iter, _ := instance.Lookup("services").Fields()
	for iter.Next() {
		optionName, err := iter.Value().String()
		if err != nil {
			log.Printf("Error fetching option name: %v\n", err)
		}
		services[iter.Label()] = optionName
	}

	model := NewGenericSelectionModel("Select a Service", "Choose a service to deploy", services)
	p := tea.NewProgram(&model)
	if err := p.Start(); err != nil {
		log.Fatalf("Failed to start program: %v", err)
	}

	log.Printf("Selected Service: %s", model.selectedItem)
}
