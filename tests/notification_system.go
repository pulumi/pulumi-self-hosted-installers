package tests

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

// NotificationChannel represents different notification delivery methods
type NotificationChannel string

const (
	ChannelSlack   NotificationChannel = "slack"
	ChannelDiscord NotificationChannel = "discord"
	ChannelEmail   NotificationChannel = "email"
	ChannelWebhook NotificationChannel = "webhook"
	ChannelGitHub  NotificationChannel = "github"
)

// NotificationLevel represents the severity/importance of notifications
type NotificationLevel string

const (
	LevelInfo     NotificationLevel = "info"
	LevelWarning  NotificationLevel = "warning"
	LevelError    NotificationLevel = "error"
	LevelCritical NotificationLevel = "critical"
)

// NotificationPayload contains the data to be sent in notifications
type NotificationPayload struct {
	Title       string                 `json:"title"`
	Message     string                 `json:"message"`
	Level       NotificationLevel      `json:"level"`
	Timestamp   time.Time              `json:"timestamp"`
	TestRunID   string                 `json:"test_run_id,omitempty"`
	Platform    string                 `json:"platform,omitempty"`
	Summary     *ReportSummary         `json:"summary,omitempty"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
	ActionItems []string               `json:"action_items,omitempty"`
}

// NotificationConfig holds configuration for different notification channels
type NotificationConfig struct {
	SlackWebhookURL   string                `json:"slack_webhook_url,omitempty"`
	DiscordWebhookURL string                `json:"discord_webhook_url,omitempty"`
	GitHubToken       string                `json:"github_token,omitempty"`
	GitHubRepo        string                `json:"github_repo,omitempty"`
	EmailSMTPHost     string                `json:"email_smtp_host,omitempty"`
	EmailSMTPPort     int                   `json:"email_smtp_port,omitempty"`
	EmailFrom         string                `json:"email_from,omitempty"`
	EmailTo           string                `json:"email_to,omitempty"`
	EmailPassword     string                `json:"email_password,omitempty"`
	CustomWebhookURL  string                `json:"custom_webhook_url,omitempty"`
	EnabledChannels   []NotificationChannel `json:"enabled_channels"`
}

// NotificationSystem manages sending notifications across multiple channels
type NotificationSystem struct {
	Config NotificationConfig
	Client *http.Client
}

// NewNotificationSystem creates a new notification system with environment-based configuration
func NewNotificationSystem() *NotificationSystem {
	config := NotificationConfig{
		SlackWebhookURL:   os.Getenv("SLACK_WEBHOOK_URL"),
		DiscordWebhookURL: os.Getenv("DISCORD_WEBHOOK_URL"),
		GitHubToken:       os.Getenv("GITHUB_TOKEN"),
		GitHubRepo:        os.Getenv("GITHUB_REPOSITORY"), // Set by GitHub Actions
		CustomWebhookURL:  os.Getenv("CUSTOM_WEBHOOK_URL"),
		EmailSMTPHost:     os.Getenv("EMAIL_SMTP_HOST"),
		EmailFrom:         os.Getenv("EMAIL_FROM"),
		EmailTo:           os.Getenv("EMAIL_TO"),
		EmailPassword:     os.Getenv("EMAIL_PASSWORD"),
		EnabledChannels:   []NotificationChannel{},
	}

	// Auto-detect enabled channels based on available configuration
	if config.SlackWebhookURL != "" {
		config.EnabledChannels = append(config.EnabledChannels, ChannelSlack)
	}
	if config.DiscordWebhookURL != "" {
		config.EnabledChannels = append(config.EnabledChannels, ChannelDiscord)
	}
	if config.GitHubToken != "" && config.GitHubRepo != "" {
		config.EnabledChannels = append(config.EnabledChannels, ChannelGitHub)
	}
	if config.CustomWebhookURL != "" {
		config.EnabledChannels = append(config.EnabledChannels, ChannelWebhook)
	}

	return &NotificationSystem{
		Config: config,
		Client: &http.Client{Timeout: 30 * time.Second},
	}
}

// SendTestStartNotification sends a notification when testing begins
func (ns *NotificationSystem) SendTestStartNotification(platformCount int, testRunID string) error {
	payload := NotificationPayload{
		Title:     "🚀 Pulumi Self-Hosted Installer Testing Started",
		Message:   fmt.Sprintf("Starting parallel testing of %d platform installers", platformCount),
		Level:     LevelInfo,
		Timestamp: time.Now(),
		TestRunID: testRunID,
		Metadata: map[string]interface{}{
			"platform_count": platformCount,
			"execution_mode": "parallel",
		},
	}

	return ns.sendNotification(payload)
}

// SendTestCompletionNotification sends a notification when testing completes
func (ns *NotificationSystem) SendTestCompletionNotification(report *TestReport) error {
	level := LevelInfo
	title := "✅ Pulumi Self-Hosted Installer Testing Completed Successfully"

	if report.Summary.FailedPlatforms > 0 {
		level = LevelError
		title = "❌ Pulumi Self-Hosted Installer Testing Completed with Failures"
	}

	message := fmt.Sprintf("Test execution completed: %d/%d platforms passed (%.1f%% success rate)",
		report.Summary.SuccessfulPlatforms,
		report.Summary.TotalPlatforms,
		report.Summary.SuccessRate)

	payload := NotificationPayload{
		Title:       title,
		Message:     message,
		Level:       level,
		Timestamp:   time.Now(),
		TestRunID:   report.Metadata.TestRunID,
		Summary:     &report.Summary,
		ActionItems: report.Insights.Recommendations,
		Metadata: map[string]interface{}{
			"total_duration":      report.Summary.TotalDuration.String(),
			"parallel_efficiency": report.Insights.ResourceEfficiency,
			"slowest_platform":    report.Insights.SlowestPlatform,
			"fastest_platform":    report.Insights.FastestPlatform,
		},
	}

	return ns.sendNotification(payload)
}

// SendPlatformFailureNotification sends immediate notification when a platform fails
func (ns *NotificationSystem) SendPlatformFailureNotification(platform string, err error, testRunID string) error {
	payload := NotificationPayload{
		Title:     fmt.Sprintf("⚠️ Platform %s Failed Testing", platform),
		Message:   fmt.Sprintf("Platform %s encountered an error during testing: %v", platform, err),
		Level:     LevelWarning,
		Timestamp: time.Now(),
		TestRunID: testRunID,
		Platform:  platform,
		ActionItems: []string{
			"Check test logs for detailed error information",
			"Verify platform-specific credentials and configuration",
			"Review infrastructure dependencies and resource quotas",
		},
	}

	return ns.sendNotification(payload)
}

// sendNotification dispatches notifications to all enabled channels
func (ns *NotificationSystem) sendNotification(payload NotificationPayload) error {
	var errors []string

	for _, channel := range ns.Config.EnabledChannels {
		if err := ns.sendToChannel(channel, payload); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %v", channel, err))
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("notification failures: %s", strings.Join(errors, "; "))
	}

	return nil
}

// sendToChannel sends notification to a specific channel
func (ns *NotificationSystem) sendToChannel(channel NotificationChannel, payload NotificationPayload) error {
	switch channel {
	case ChannelSlack:
		return ns.sendSlackNotification(payload)
	case ChannelDiscord:
		return ns.sendDiscordNotification(payload)
	case ChannelGitHub:
		return ns.sendGitHubNotification(payload)
	case ChannelWebhook:
		return ns.sendWebhookNotification(payload)
	default:
		return fmt.Errorf("unsupported notification channel: %s", channel)
	}
}

// sendSlackNotification sends notification to Slack
func (ns *NotificationSystem) sendSlackNotification(payload NotificationPayload) error {
	if ns.Config.SlackWebhookURL == "" {
		return fmt.Errorf("slack webhook URL not configured")
	}

	// Create Slack-specific payload
	slackPayload := map[string]interface{}{
		"text": payload.Title,
		"attachments": []map[string]interface{}{
			{
				"color":     ns.getSlackColor(payload.Level),
				"title":     payload.Title,
				"text":      payload.Message,
				"timestamp": payload.Timestamp.Unix(),
				"fields": []map[string]interface{}{
					{
						"title": "Test Run ID",
						"value": payload.TestRunID,
						"short": true,
					},
					{
						"title": "Platform",
						"value": payload.Platform,
						"short": true,
					},
				},
			},
		},
	}

	// Add summary fields if available
	if payload.Summary != nil {
		attachment := slackPayload["attachments"].([]map[string]interface{})[0]
		fields := attachment["fields"].([]map[string]interface{})

		fields = append(fields, map[string]interface{}{
			"title": "Success Rate",
			"value": fmt.Sprintf("%.1f%% (%d/%d)", payload.Summary.SuccessRate,
				payload.Summary.SuccessfulPlatforms, payload.Summary.TotalPlatforms),
			"short": true,
		})

		fields = append(fields, map[string]interface{}{
			"title": "Duration",
			"value": payload.Summary.TotalDuration.String(),
			"short": true,
		})

		attachment["fields"] = fields
	}

	// Add action items if available
	if len(payload.ActionItems) > 0 {
		attachment := slackPayload["attachments"].([]map[string]interface{})[0]
		attachment["footer"] = "Recommendations: " + strings.Join(payload.ActionItems, " • ")
	}

	return ns.sendHTTPPayload(ns.Config.SlackWebhookURL, slackPayload)
}

// sendDiscordNotification sends notification to Discord
func (ns *NotificationSystem) sendDiscordNotification(payload NotificationPayload) error {
	if ns.Config.DiscordWebhookURL == "" {
		return fmt.Errorf("discord webhook URL not configured")
	}

	// Create Discord embed
	embed := map[string]interface{}{
		"title":       payload.Title,
		"description": payload.Message,
		"color":       ns.getDiscordColor(payload.Level),
		"timestamp":   payload.Timestamp.Format(time.RFC3339),
		"fields":      []map[string]interface{}{},
	}

	// Add fields
	if payload.TestRunID != "" {
		fields := embed["fields"].([]map[string]interface{})
		fields = append(fields, map[string]interface{}{
			"name":   "Test Run ID",
			"value":  payload.TestRunID,
			"inline": true,
		})
		embed["fields"] = fields
	}

	discordPayload := map[string]interface{}{
		"embeds": []map[string]interface{}{embed},
	}

	return ns.sendHTTPPayload(ns.Config.DiscordWebhookURL, discordPayload)
}

// sendGitHubNotification creates a GitHub issue comment or discussion
func (ns *NotificationSystem) sendGitHubNotification(payload NotificationPayload) error {
	// For now, we'll skip GitHub notifications as they require more complex API integration
	// This could be implemented to create issues, comments, or discussions
	return nil
}

// sendWebhookNotification sends to a custom webhook
func (ns *NotificationSystem) sendWebhookNotification(payload NotificationPayload) error {
	if ns.Config.CustomWebhookURL == "" {
		return fmt.Errorf("custom webhook URL not configured")
	}

	return ns.sendHTTPPayload(ns.Config.CustomWebhookURL, payload)
}

// sendHTTPPayload sends HTTP POST request with JSON payload
func (ns *NotificationSystem) sendHTTPPayload(url string, payload interface{}) error {
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	resp, err := ns.Client.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to send HTTP request: %w", err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			fmt.Printf("Warning: failed to close response body: %v\n", err)
		}
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP request failed with status %d", resp.StatusCode)
	}

	return nil
}

// getSlackColor returns appropriate color for Slack notifications
func (ns *NotificationSystem) getSlackColor(level NotificationLevel) string {
	switch level {
	case LevelInfo:
		return "good" // Green
	case LevelWarning:
		return "warning" // Yellow
	case LevelError, LevelCritical:
		return "danger" // Red
	default:
		return "#36a64f" // Default green
	}
}

// getDiscordColor returns appropriate color for Discord embeds
func (ns *NotificationSystem) getDiscordColor(level NotificationLevel) int {
	switch level {
	case LevelInfo:
		return 0x28a745 // Green
	case LevelWarning:
		return 0xffc107 // Yellow
	case LevelError, LevelCritical:
		return 0xdc3545 // Red
	default:
		return 0x17a2b8 // Blue
	}
}

// IsConfigured returns whether the notification system has any channels configured
func (ns *NotificationSystem) IsConfigured() bool {
	return len(ns.Config.EnabledChannels) > 0
}

// GetEnabledChannels returns the list of enabled notification channels
func (ns *NotificationSystem) GetEnabledChannels() []NotificationChannel {
	return ns.Config.EnabledChannels
}
