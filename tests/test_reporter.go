package tests

import (
	"encoding/json"
	"fmt"
	"html/template"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// TestReport represents a comprehensive test execution report
type TestReport struct {
	Metadata        ReportMetadata `json:"metadata"`
	Summary         ReportSummary  `json:"summary"`
	PlatformResults []TestResult   `json:"platform_results"`
	Insights        ReportInsights `json:"insights"`
}

// ReportMetadata contains information about the test run environment and configuration
type ReportMetadata struct {
	TestRunID      string            `json:"test_run_id"`
	Timestamp      time.Time         `json:"timestamp"`
	ExecutionMode  string            `json:"execution_mode"` // "sequential", "parallel"
	MaxConcurrency int               `json:"max_concurrency,omitempty"`
	TotalTimeout   time.Duration     `json:"total_timeout"`
	Environment    map[string]string `json:"environment"`
	PulumiVersion  string            `json:"pulumi_version,omitempty"`
	GoVersion      string            `json:"go_version,omitempty"`
	NodeVersion    string            `json:"node_version,omitempty"`
}

// ReportSummary provides high-level statistics about the test run
type ReportSummary struct {
	TotalPlatforms      int           `json:"total_platforms"`
	SuccessfulPlatforms int           `json:"successful_platforms"`
	FailedPlatforms     int           `json:"failed_platforms"`
	SkippedPlatforms    int           `json:"skipped_platforms"`
	SuccessRate         float64       `json:"success_rate"`
	TotalDuration       time.Duration `json:"total_duration"`
	AverageDuration     time.Duration `json:"average_duration"`
	TotalStages         int           `json:"total_stages"`
	SuccessfulStages    int           `json:"successful_stages"`
	FailedStages        int           `json:"failed_stages"`
}

// ReportInsights provides analysis and recommendations based on test results
type ReportInsights struct {
	SlowestPlatform    string        `json:"slowest_platform,omitempty"`
	SlowestDuration    time.Duration `json:"slowest_duration,omitempty"`
	FastestPlatform    string        `json:"fastest_platform,omitempty"`
	FastestDuration    time.Duration `json:"fastest_duration,omitempty"`
	MostFailedStage    string        `json:"most_failed_stage,omitempty"`
	Recommendations    []string      `json:"recommendations"`
	ResourceEfficiency float64       `json:"resource_efficiency"` // Parallel speedup factor
}

// TestReporter handles generation of various report formats
type TestReporter struct {
	OutputDir string
}

// NewTestReporter creates a new test reporter
func NewTestReporter(outputDir string) *TestReporter {
	return &TestReporter{
		OutputDir: outputDir,
	}
}

// GenerateReport creates a comprehensive test report from results
func (reporter *TestReporter) GenerateReport(results []TestResult, metadata ReportMetadata) (*TestReport, error) {
	summary := reporter.calculateSummary(results)
	insights := reporter.generateInsights(results, summary)

	report := &TestReport{
		Metadata:        metadata,
		Summary:         summary,
		PlatformResults: results,
		Insights:        insights,
	}

	return report, nil
}

// SaveReport saves the report in multiple formats
func (reporter *TestReporter) SaveReport(report *TestReport) error {
	// Ensure output directory exists
	if err := os.MkdirAll(reporter.OutputDir, 0755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	// Save JSON report
	if err := reporter.saveJSONReport(report); err != nil {
		return fmt.Errorf("failed to save JSON report: %w", err)
	}

	// Save Markdown report
	if err := reporter.saveMarkdownReport(report); err != nil {
		return fmt.Errorf("failed to save Markdown report: %w", err)
	}

	// Save HTML report
	if err := reporter.saveHTMLReport(report); err != nil {
		return fmt.Errorf("failed to save HTML report: %w", err)
	}

	// Save CSV summary
	if err := reporter.saveCSVSummary(report); err != nil {
		return fmt.Errorf("failed to save CSV summary: %w", err)
	}

	return nil
}

// calculateSummary computes summary statistics from test results
func (reporter *TestReporter) calculateSummary(results []TestResult) ReportSummary {
	summary := ReportSummary{
		TotalPlatforms: len(results),
	}

	if len(results) == 0 {
		return summary
	}

	var totalDuration time.Duration
	var earliestStart, latestEnd time.Time

	for i, result := range results {
		// Count platforms by status
		if result.Success {
			summary.SuccessfulPlatforms++
		} else {
			summary.FailedPlatforms++
		}

		// Calculate duration statistics
		totalDuration += result.Duration

		if i == 0 {
			earliestStart = result.StartTime
			latestEnd = result.EndTime
		} else {
			if result.StartTime.Before(earliestStart) {
				earliestStart = result.StartTime
			}
			if result.EndTime.After(latestEnd) {
				latestEnd = result.EndTime
			}
		}

		// Count stages
		for _, stage := range result.Stages {
			summary.TotalStages++
			if stage.Success {
				summary.SuccessfulStages++
			} else {
				summary.FailedStages++
			}
		}
	}

	// Calculate derived metrics
	summary.SuccessRate = float64(summary.SuccessfulPlatforms) / float64(summary.TotalPlatforms) * 100.0
	summary.TotalDuration = latestEnd.Sub(earliestStart)
	summary.AverageDuration = totalDuration / time.Duration(len(results))

	return summary
}

// generateInsights creates insights and recommendations
func (reporter *TestReporter) generateInsights(results []TestResult, summary ReportSummary) ReportInsights {
	insights := ReportInsights{
		Recommendations: []string{},
	}

	if len(results) == 0 {
		return insights
	}

	// Find slowest and fastest platforms
	for i, result := range results {
		if i == 0 || result.Duration > insights.SlowestDuration {
			insights.SlowestPlatform = result.Platform
			insights.SlowestDuration = result.Duration
		}
		if i == 0 || result.Duration < insights.FastestDuration {
			insights.FastestPlatform = result.Platform
			insights.FastestDuration = result.Duration
		}
	}

	// Calculate resource efficiency (parallel speedup)
	if summary.TotalDuration > 0 {
		serialDuration := time.Duration(0)
		for _, result := range results {
			serialDuration += result.Duration
		}
		insights.ResourceEfficiency = float64(serialDuration) / float64(summary.TotalDuration)
	}

	// Generate recommendations
	if summary.SuccessRate < 100.0 {
		insights.Recommendations = append(insights.Recommendations,
			fmt.Sprintf("%.1f%% of platforms failed - investigate failing stages and improve error handling",
				100.0-summary.SuccessRate))
	}

	if insights.SlowestDuration > insights.FastestDuration*2 {
		insights.Recommendations = append(insights.Recommendations,
			fmt.Sprintf("Platform %s takes %.1fx longer than %s - consider optimizing slow deployment stages",
				insights.SlowestPlatform,
				float64(insights.SlowestDuration)/float64(insights.FastestDuration),
				insights.FastestPlatform))
	}

	if insights.ResourceEfficiency > 3.0 {
		insights.Recommendations = append(insights.Recommendations,
			fmt.Sprintf("Excellent parallel efficiency (%.1fx speedup) - maintain current concurrency settings",
				insights.ResourceEfficiency))
	} else if insights.ResourceEfficiency < 1.5 {
		insights.Recommendations = append(insights.Recommendations,
			"Low parallel efficiency - consider increasing concurrency or reducing resource contention")
	}

	return insights
}

// saveJSONReport saves the report as JSON
func (reporter *TestReporter) saveJSONReport(report *TestReport) error {
	filename := filepath.Join(reporter.OutputDir, "test-report.json")

	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filename, data, 0644)
}

// saveMarkdownReport saves the report as Markdown
func (reporter *TestReporter) saveMarkdownReport(report *TestReport) error {
	filename := filepath.Join(reporter.OutputDir, "test-report.md")

	var md strings.Builder

	// Header
	md.WriteString("# Pulumi Self-Hosted Installers Test Report\n\n")
	md.WriteString(fmt.Sprintf("**Generated:** %s\n", report.Metadata.Timestamp.Format("2006-01-02 15:04:05 UTC")))
	md.WriteString(fmt.Sprintf("**Test Run ID:** %s\n", report.Metadata.TestRunID))
	md.WriteString(fmt.Sprintf("**Execution Mode:** %s\n\n", report.Metadata.ExecutionMode))

	// Summary
	md.WriteString("## 📊 Summary\n\n")
	md.WriteString(fmt.Sprintf("- **Total Platforms:** %d\n", report.Summary.TotalPlatforms))
	md.WriteString(fmt.Sprintf("- **Successful:** %d ✅\n", report.Summary.SuccessfulPlatforms))
	md.WriteString(fmt.Sprintf("- **Failed:** %d ❌\n", report.Summary.FailedPlatforms))
	md.WriteString(fmt.Sprintf("- **Success Rate:** %.1f%%\n", report.Summary.SuccessRate))
	md.WriteString(fmt.Sprintf("- **Total Duration:** %v\n", report.Summary.TotalDuration))
	md.WriteString(fmt.Sprintf("- **Average Duration:** %v\n\n", report.Summary.AverageDuration))

	// Platform Results
	md.WriteString("## 🏗️ Platform Results\n\n")
	md.WriteString("| Platform | Status | Duration | Stages | Environment |\n")
	md.WriteString("|----------|--------|----------|--------|--------------|\n")

	for _, result := range report.PlatformResults {
		status := "✅ PASS"
		if !result.Success {
			status = "❌ FAIL"
		}

		stagesSummary := fmt.Sprintf("%d/%d",
			countSuccessfulStages(result.Stages), len(result.Stages))

		md.WriteString(fmt.Sprintf("| %s | %s | %v | %s | %s |\n",
			result.Platform, status, result.Duration, stagesSummary, result.Environment))
	}
	md.WriteString("\n")

	// Insights
	if len(report.Insights.Recommendations) > 0 {
		md.WriteString("## 💡 Insights & Recommendations\n\n")
		for _, rec := range report.Insights.Recommendations {
			md.WriteString(fmt.Sprintf("- %s\n", rec))
		}
		md.WriteString("\n")
	}

	// Performance metrics
	md.WriteString("## ⚡ Performance Metrics\n\n")
	md.WriteString(fmt.Sprintf("- **Fastest Platform:** %s (%v)\n",
		report.Insights.FastestPlatform, report.Insights.FastestDuration))
	md.WriteString(fmt.Sprintf("- **Slowest Platform:** %s (%v)\n",
		report.Insights.SlowestPlatform, report.Insights.SlowestDuration))
	md.WriteString(fmt.Sprintf("- **Parallel Efficiency:** %.1fx speedup\n\n",
		report.Insights.ResourceEfficiency))

	return os.WriteFile(filename, []byte(md.String()), 0644)
}

// saveHTMLReport saves the report as HTML
func (reporter *TestReporter) saveHTMLReport(report *TestReport) error {
	filename := filepath.Join(reporter.OutputDir, "test-report.html")

	htmlTemplate := `<!DOCTYPE html>
<html>
<head>
    <title>Pulumi Self-Hosted Installers Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #4d5bd9; padding-bottom: 20px; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric { background: #f8f9fa; padding: 15px; border-radius: 6px; text-align: center; }
        .metric .value { font-size: 24px; font-weight: bold; color: #4d5bd9; }
        .metric .label { color: #666; margin-top: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #4d5bd9; color: white; }
        .pass { color: #28a745; font-weight: bold; }
        .fail { color: #dc3545; font-weight: bold; }
        .recommendations { background: #e3f2fd; padding: 20px; border-radius: 6px; border-left: 4px solid #2196f3; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Pulumi Self-Hosted Installers Test Report</h1>
            <p><strong>Generated:</strong> {{.Metadata.Timestamp.Format "2006-01-02 15:04:05 UTC"}}</p>
            <p><strong>Test Run ID:</strong> {{.Metadata.TestRunID}}</p>
            <p><strong>Execution Mode:</strong> {{.Metadata.ExecutionMode}}</p>
        </div>

        <div class="summary">
            <div class="metric">
                <div class="value">{{.Summary.TotalPlatforms}}</div>
                <div class="label">Total Platforms</div>
            </div>
            <div class="metric">
                <div class="value">{{.Summary.SuccessfulPlatforms}}</div>
                <div class="label">Successful</div>
            </div>
            <div class="metric">
                <div class="value">{{.Summary.FailedPlatforms}}</div>
                <div class="label">Failed</div>
            </div>
            <div class="metric">
                <div class="value">{{printf "%.1f%%" .Summary.SuccessRate}}</div>
                <div class="label">Success Rate</div>
            </div>
            <div class="metric">
                <div class="value">{{.Summary.TotalDuration}}</div>
                <div class="label">Total Duration</div>
            </div>
            <div class="metric">
                <div class="value">{{printf "%.1fx" .Insights.ResourceEfficiency}}</div>
                <div class="label">Parallel Speedup</div>
            </div>
        </div>

        <h2>🏗️ Platform Results</h2>
        <table>
            <tr>
                <th>Platform</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Stages</th>
                <th>Environment</th>
            </tr>
            {{range .PlatformResults}}
            <tr>
                <td>{{.Platform}}</td>
                <td>{{if .Success}}<span class="pass">✅ PASS</span>{{else}}<span class="fail">❌ FAIL</span>{{end}}</td>
                <td>{{.Duration}}</td>
                <td>{{len .Stages}} stages</td>
                <td>{{.Environment}}</td>
            </tr>
            {{end}}
        </table>

        {{if .Insights.Recommendations}}
        <div class="recommendations">
            <h3>💡 Recommendations</h3>
            <ul>
                {{range .Insights.Recommendations}}
                <li>{{.}}</li>
                {{end}}
            </ul>
        </div>
        {{end}}
    </div>
</body>
</html>`

	tmpl, err := template.New("report").Parse(htmlTemplate)
	if err != nil {
		return err
	}

	file, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer func() {
		if err := file.Close(); err != nil {
			fmt.Printf("Warning: failed to close file: %v\n", err)
		}
	}()

	return tmpl.Execute(file, report)
}

// saveCSVSummary saves a CSV summary for data analysis
func (reporter *TestReporter) saveCSVSummary(report *TestReport) error {
	filename := filepath.Join(reporter.OutputDir, "test-summary.csv")

	var csv strings.Builder
	csv.WriteString("Platform,Success,Duration_Seconds,Stages_Total,Stages_Successful,Environment,Start_Time,End_Time\n")

	for _, result := range report.PlatformResults {
		csv.WriteString(fmt.Sprintf("%s,%t,%.1f,%d,%d,%s,%s,%s\n",
			result.Platform,
			result.Success,
			result.Duration.Seconds(),
			len(result.Stages),
			countSuccessfulStages(result.Stages),
			result.Environment,
			result.StartTime.Format(time.RFC3339),
			result.EndTime.Format(time.RFC3339),
		))
	}

	return os.WriteFile(filename, []byte(csv.String()), 0644)
}

// Helper function to count successful stages
func countSuccessfulStages(stages []StageResult) int {
	count := 0
	for _, stage := range stages {
		if stage.Success {
			count++
		}
	}
	return count
}
