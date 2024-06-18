package cli

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"cuelang.org/go/cue/cuecontext"
	"cuelang.org/go/cue/format"
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

		// Debug: Print the structure of the CUE file
		log.Printf("CUE file structure: %v", inst)

		// Read the existing configuration from the config file
		configFilePath := "../config/config.cue"
		existingConfigBytes, err := os.ReadFile(configFilePath)
		if err != nil {
			log.Printf("Error reading existing config file: %v", err)
			fmt.Println("Error reading existing config file:", err)
			return
		}

		// Parse the existing configuration
		existingGlobalConfig := ctx.CompileBytes(existingConfigBytes)
		if existingGlobalConfig.Err() != nil {
			log.Printf("Error compiling existing config file: %v", existingGlobalConfig.Err())
			fmt.Println("Error compiling existing config file:", existingGlobalConfig.Err())
			return
		}

		// Load global configuration from CUE file
		selectedDeploymentOptions := existingGlobalConfig.LookupPath(cue.ParsePath("selectedDeploymentOptions"))
		if !selectedDeploymentOptions.Exists() {
			log.Println("Warning: field 'selectedDeploymentOptions' not found in the existing config file. Proceeding without selectedDeploymentOptions configuration.")
		} else {
			log.Printf("selectedDeploymentOptions configuration loaded successfully: %v", selectedDeploymentOptions)
		}

		// Initialize the data struct with default values
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

		// Select provider with the option to keep the current value
		var currentProvider string
		if cp, err := existingGlobalConfig.LookupPath(cue.ParsePath("selectedDeploymentOptions.provider")).String(); err == nil {
			currentProvider = cp
		}
		log.Printf("Current provider: %s", currentProvider)
		providerModel := NewGenericSelectionModel("Select a provider (press Enter to keep current value)", "", items, currentProvider)
		if currentProvider != "" {
			providerModel.selectedItem = currentProvider
		}
		existingGlobalConfig = existingGlobalConfig.FillPath(cue.ParsePath("selectedDeploymentOptions.provider"), currentProvider).Unify(ctx.CompileString(fmt.Sprintf(`selectedDeploymentOptions: { provider: "%s" }`, currentProvider)))
		p := tea.NewProgram(&providerModel)
		if _, err := p.Run(); err != nil {
			log.Fatalf("Error starting Bubbletea program: %v", err)
		}

		// Capture and log the selected provider
		log.Printf("Provider model selected item: %s", providerModel.selectedItem)
		if providerModel.selectedItem == "" {
			log.Fatalf("No provider selected")
		}
		data.Provider = providerModel.selectedItem
		existingGlobalConfig = existingGlobalConfig.FillPath(cue.ParsePath("selectedDeploymentOptions.provider"), data.Provider)
		log.Printf("Selected provider: %s", data.Provider)

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

		// Select platform with the option to keep the current value
		var currentPlatform string
		platformPath := cue.ParsePath("selectedDeploymentOptions.platform")
		log.Printf("Looking up path: %s", platformPath)
		log.Printf("selectedDeploymentOptions config: %v", selectedDeploymentOptions)
		if cp := existingGlobalConfig.LookupPath(platformPath); cp.Exists() {
			currentPlatform, _ = cp.String()
			log.Printf("Found current platform: %s", currentPlatform)
		} else {
			log.Printf("Current platform not found in selectedDeploymentOptions config")
		}
		log.Printf("Current platform after lookup: %s", currentPlatform)
		platformModel = NewGenericSelectionModel(fmt.Sprintf("Select Platform"), "", items, currentPlatform)
		if currentPlatform != "" {
			platformModel.selectedItem = currentPlatform
		}
		existingGlobalConfig = existingGlobalConfig.FillPath(cue.ParsePath("selectedDeploymentOptions.platform"), currentPlatform)
		p = tea.NewProgram(&platformModel)
		if _, err := p.Run(); err != nil {
			log.Fatalf("Error starting Bubbletea program: %v", err)
		}
		if platformModel.selectedItem == "" {
			log.Fatalf("No platform selected")
		}
		data.Platform = platformModel.selectedItem
		existingGlobalConfig = existingGlobalConfig.FillPath(cue.ParsePath("selectedDeploymentOptions.platform"), data.Platform)
		log.Printf("Selected platform: %s", data.Platform)
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
					// Select service option with the option to keep the current value
					var currentServiceOption string
					if cso, err := existingGlobalConfig.LookupPath(cue.ParsePath(fmt.Sprintf("selectedDeploymentOptions.services.%s.deployment", service))).String(); err == nil {
						currentServiceOption = cso
					}
					log.Printf("Current option for %s: %s", service, currentServiceOption)
					serviceModel := NewGenericSelectionModel(fmt.Sprintf("Select an option for %s (press Enter to keep current value)", service), "", items, currentServiceOption)
					if currentServiceOption != "" {
						serviceModel.selectedItem = currentServiceOption
					}
					p = tea.NewProgram(&serviceModel)
					if _, err := p.Run(); err != nil {
						log.Fatalf("Error starting Bubbletea program: %v", err)
					}
					if serviceModel.selectedItem == "" {
						log.Fatalf("No option selected for service: %s", service)
					}
					data.Services[service] = serviceModel.selectedItem
					log.Printf("Selected option for %s: %s", service, serviceModel.selectedItem)
					if existingGlobalConfig.Exists() {
						existingGlobalConfig = existingGlobalConfig.FillPath(cue.ParsePath(fmt.Sprintf("selectedDeploymentOptions.services.%s.deployment", service)), serviceModel.selectedItem)
					}
				}
			}
		}

		log.Println("Selected options:")
		log.Printf("Provider: %s", data.Provider)
		log.Printf("Platform: %s", data.Platform)
		for k, v := range data.Services {
			log.Printf("%s: %s", k, v)
			fmt.Printf("%s: %s\n", k, v)
		}

		fmt.Println("Saving configuration...")

		configDir := "../config"
		configFilePath = configDir + "/config.cue"

		// Create the directory if it doesn't exist
		if err := os.MkdirAll(configDir, os.ModePerm); err != nil {
			log.Printf("Error creating config directory: %v", err)
			fmt.Println("Error creating config directory:", err)
			return
		}
		absConfigFilePath, err := filepath.Abs(configFilePath)
		if err != nil {
			log.Printf("Error getting absolute path: %v", err)
			fmt.Println("Error getting absolute path:", err)
			return
		}
		log.Printf("Writing configuration to %s", absConfigFilePath)
		formattedConfig, err := format.Node(existingGlobalConfig.Value().Syntax())
		if err != nil {
			log.Printf("Error formatting CUE configuration: %v", err)
			fmt.Println("Error formatting CUE configuration:", err)
			return
		}

		err = os.WriteFile(configFilePath, formattedConfig, 0644)
		if err != nil {
			log.Printf("Error saving configuration: %v", err)
			fmt.Println("Error saving configuration:", err)
		} else {
			log.Println("Configuration saved successfully.")
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
