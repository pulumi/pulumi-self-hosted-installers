package cli

import (
	"fmt"
	"log"
	"os"

	"cuelang.org/go/cue/cuecontext"
	"github.com/spf13/viper"

	tea "github.com/charmbracelet/bubbletea"

	"cuelang.org/go/cue"
	"github.com/spf13/cobra"
)

var cfgFile string

func init() {
	cobra.OnInitialize(initConfig)
}

func initConfig() {
	if cfgFile != "" {
		viper.SetConfigFile(cfgFile)
	} else {
		home, err := os.UserHomeDir()
		cobra.CheckErr(err)

		viper.AddConfigPath(home)
		viper.SetConfigName(".config")
	}

	viper.AutomaticEnv()

	if err := viper.ReadInConfig(); err == nil {
		fmt.Println("Using config file:", viper.ConfigFileUsed())
	}
}

var configureCmd = &cobra.Command{
	Use:   "configure",
	Short: "Configure the deployment options",
	Run: func(cmd *cobra.Command, args []string) {
		// Load deployment patterns from CUE file
		ctx := cuecontext.New()
		setupLogging()

		f, err := os.ReadFile("../cue/deployment_patterns.cue")
		if err != nil {
			fmt.Println("Error reading CUE file:", err)
			return
		}
		// Create a new CUE instance from the file content
		inst := ctx.CompileBytes(f)
		if inst.Err() != nil {
			fmt.Println("Error compiling CUE file:", inst.Err())
			return
		}

		// Load global configuration from CUE file
		globalConfig := ctx.CompileBytes(f).LookupPath(cue.ParsePath("global"))
		if globalConfig.Err() != nil {
			fmt.Println("Error loading global configuration:", globalConfig.Err())
			return
		}

		// Initialize the data struct
		data := ConfigData{
			Services: make(map[string]string),
		}

		// Get top-level keys and descriptions
		deploymentOptions := inst.LookupPath(cue.ParsePath("deploymentOptions"))
		iter, err := deploymentOptions.Fields()
		if err != nil {
			log.Fatalf("Error fetching fields: %v\n", err)
		}
		items := make(map[string]string)
		for iter.Next() {
			v := iter.Value()
			desc := "No description available"
			if v.Exists() {
				if descVal := v.LookupPath(cue.ParsePath("description")); descVal.Exists() {
					if d, err := descVal.String(); err == nil {
						desc = d
					} else {
						log.Printf("Error fetching description for %s: %v\n", iter.Label(), err)
					}
				}
			}
			items[iter.Label()] = desc
		}

		// Declare variables for provider, platforms, and platformModel
		var provider cue.Value
		var platforms cue.Value
		var platformModel GenericSelectionModel

		// Select provider
		providerModel := NewGenericSelectionModel("Select a provider", "test status message", items)
		p := tea.NewProgram(&providerModel)
		if err := p.Start(); err != nil {
			log.Fatalf("Error starting Bubbletea program: %v", err)
		}

		// Capture and log the selected provider
		log.Printf("Provider model selected item: %s", providerModel.selectedItem)
		if providerModel.selectedItem == "" {
			log.Fatalf("No provider selected")
		}
		data.Provider = providerModel.selectedItem
		log.Printf("Selected provider: %s", data.Provider)
		globalConfig = globalConfig.FillPath(cue.ParsePath("selectedDeploymentOptions.provider"), data.Provider)

		// Fetch platform options for the selected provider
		log.Printf("Fetching platform options for provider: %s", data.Provider)
		provider = inst.LookupPath(cue.ParsePath("deploymentOptions." + data.Provider))
		log.Printf("Provider: %v", provider)
		platforms = provider.LookupPath(cue.ParsePath("platforms"))
		log.Printf("Platforms: %v", platforms)
		log.Printf("Platforms.Exists(): %v", platforms.Exists())

		if platforms.Exists() {
			iter, _ := platforms.List()
			items = make(map[string]string)
			for iter.Next() {
				v := iter.Value()
				name, _ := v.LookupPath(cue.ParsePath("name")).String()
				desc := "No description available"
				if descVal := v.LookupPath(cue.ParsePath("description")); descVal.Exists() {
					if d, err := descVal.String(); err == nil {
						desc = d
					} else {
						log.Printf("Error fetching description for %s: %v", name, err)
					}
				}
				items[name] = desc
				log.Printf("Platform found: %s with description: %s", name, desc)
			}
			log.Printf("Platform options: %v", items)
		} else {
			log.Printf("No platforms found for provider: %s", data.Provider)
			items = make(map[string]string)
		}

		// Select platform
		platformModel = NewGenericSelectionModel("Select a platform", "", items)
		p = tea.NewProgram(&platformModel)
		if err := p.Start(); err != nil {
			log.Fatalf("Error starting Bubbletea program: %v", err)
		}
		if platformModel.selectedItem == "" {
			log.Fatalf("No platform selected")
		}
		data.Platform = platformModel.selectedItem
		log.Printf("Selected platform: %s", data.Platform)
		globalConfig = globalConfig.FillPath(cue.ParsePath("selectedDeploymentOptions.platform"), data.Platform)

		// Select services
		for _, service := range []string{"opensearch", "opensearchDashboards", "api", "console", "db", "migration"} {
			serviceOptions := provider.LookupPath(cue.ParsePath(fmt.Sprintf("services.%s", service)))
			if serviceOptions.Exists() {
				var options []string
				iter, _ := serviceOptions.List()
				for iter.Next() {
					optionName, _ := iter.Value().LookupPath(cue.ParsePath("name")).String()
					options = append(options, optionName)
				}

				if len(options) > 1 {
					items = make(map[string]string)
					for _, option := range options {
						items[option] = "No description available"
					}
					serviceModel := NewGenericSelectionModel(fmt.Sprintf("Select an option for %s", service), "mystatus", items)
					p = tea.NewProgram(&serviceModel)
					if err := p.Start(); err != nil {
						log.Fatalf("Error starting Bubbletea program: %v", err)
					}
					if serviceModel.selectedItem == "" {
						log.Fatalf("No option selected for service: %s", service)
					}
					data.Services[service] = serviceModel.selectedItem
					log.Printf("Selected option for %s: %s", service, serviceModel.selectedItem)
					globalConfig = globalConfig.FillPath(cue.ParsePath(fmt.Sprintf("selectedDeploymentOptions.services.%s.deployment", service)), serviceModel.selectedItem)
				}
			}
		}

		log.Println("Selected options:")
		log.Printf("Provider: %s", data.Provider)
		log.Printf("Platform: %s", data.Platform)
		for k, v := range data.Services {
			log.Printf("%s: %s", k, v)
		}
		fmt.Println("Selected options:")
		fmt.Printf("Provider: %s\n", data.Provider)
		fmt.Printf("Platform: %s\n", data.Platform)
		for k, v := range data.Services {
			fmt.Printf("%s: %s\n", k, v)
		}
		fmt.Println("Saving configuration...")
		configStr, err := globalConfig.String()
		if err != nil {
			fmt.Println("Error converting globalConfig to string:", err)
			return
		}
		err = os.WriteFile("path/to/save/config.cue", []byte(configStr), 0644)
		if err != nil {
			fmt.Println("Error saving configuration:", err)
		} else {
			fmt.Println("Configuration saved successfully.")
		}
	},
}

type ConfigData struct {
	Provider string
	Platform string
	Services map[string]string
}

type Config struct {
	Provider string
	Platform string
	Services map[string]string
}
