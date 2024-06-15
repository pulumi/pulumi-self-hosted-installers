package cli

import (
	"fmt"
	"log"
	"os"

	"cuelang.org/go/cue"
	"github.com/charmbracelet/bubbles/list"
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "installer",
	Short: "Installer CLI for self-hosted Pulumi tools",
	Long:  `Installer CLI for self-hosted Pulumi tools, allowing configuration and installation of various tools.`,
}

var debugFile string

func init() {
	rootCmd.PersistentFlags().StringVar(&debugFile, "debug-file", "debug.log", "path to the debug log file")
	rootCmd.AddCommand(configureCmd)
}

func setupLogging() {
	if debugFile != "" {
		logFile, err := os.OpenFile(debugFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
		if err != nil {
			fmt.Printf("Failed to open log file: %v", err)
			os.Exit(1)
		}
		log.SetOutput(logFile)
	}
}

func collectServiceOptions(inst cue.Value, selected map[string]string) map[string][]list.Item {
	serviceOptions := make(map[string][]list.Item)
	provider := inst.LookupPath(cue.ParsePath("deploymentOptions." + selected["provider"]))
	services := provider.LookupPath(cue.ParsePath("services"))
	if services.Exists() {
		iter, err := services.Fields()
		if err != nil {
			log.Printf("Failed to iterate over services: %v", err)
		}
		for iter.Next() {
			service := iter.Value()
			serviceName := iter.Label()
			options := []list.Item{}
			serviceIter, err := service.Fields()
			if err != nil {
				log.Printf("Failed to iterate over service options: %v", err)
			}
			for serviceIter.Next() {
				option := serviceIter.Value()
				optionName, _ := option.LookupPath(cue.ParsePath("name")).String()
				optionDescription, _ := option.LookupPath(cue.ParsePath("description")).String()
				options = append(options, item{title: optionName, description: optionDescription})
			}
			serviceOptions[serviceName] = options
		}
	}
	return serviceOptions
}

func Execute() {
	log.Println("Starting CLI execution")
	if err := rootCmd.Execute(); err != nil {
		log.Printf("Error executing root command: %v", err)
		os.Exit(1)
	}
	log.Println("CLI execution completed successfully")
}
