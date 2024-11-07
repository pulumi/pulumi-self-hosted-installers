//go:build integration
// +build integration

package tests

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"
)

// TestAllPlatformsParallel runs all platform tests in parallel
func TestAllPlatformsParallel(t *testing.T) {
	// Create parallel test runner with appropriate settings
	runner := NewParallelTestRunner(
		3,           // Max 3 concurrent platform tests to avoid resource conflicts
		2*time.Hour, // 2 hour total timeout for all tests
	)

	// Initialize notification system
	notificationSystem := NewNotificationSystem()
	if notificationSystem.IsConfigured() {
		t.Logf("📢 Notification system enabled for channels: %v", notificationSystem.GetEnabledChannels())
	} else {
		t.Log("📢 No notification channels configured")
	}

	// Initialize metrics collection
	testRunID := fmt.Sprintf("parallel-run-%d", time.Now().Unix())
	metricsCollector := NewMetricsCollector(testRunID, "test-results/metrics")
	metricsCollector.StartSystemMetricsCollection()
	defer func() {
		metricsCollector.StopSystemMetricsCollection()
		if err := metricsCollector.SaveMetrics(); err != nil {
			t.Logf("⚠️  Failed to save metrics: %v", err)
		} else {
			t.Logf("📊 Metrics saved to: test-results/metrics/")
		}
	}()

	t.Logf("📊 Metrics collection started for test run: %s", testRunID)

	// Define platform test functions
	platformTests := map[string]PlatformTestFunc{
		"aws-eks": func(t *testing.T) *TestResult {
			return runAwsEksTestWithMetrics(t, metricsCollector)
		},
		"aws-ecs-ts": func(t *testing.T) *TestResult {
			return runAwsEcsTsTestWithMetrics(t, metricsCollector)
		},
		"aws-ecs-go": func(t *testing.T) *TestResult {
			return runAwsEcsGoTestWithMetrics(t, metricsCollector)
		},
	}

	// Add Azure and GCP tests if environment variables are set
	if hasAzureCredentials() {
		platformTests["azure-aks"] = func(t *testing.T) *TestResult {
			return runAzureAksTestWithMetrics(t, metricsCollector)
		}
	} else {
		t.Log("⏭️  Skipping Azure AKS tests - credentials not available")
	}

	if hasGcpCredentials() {
		platformTests["gcp-gke"] = func(t *testing.T) *TestResult {
			return runGcpGkeTestWithMetrics(t, metricsCollector)
		}
	} else {
		t.Log("⏭️  Skipping GCP GKE tests - credentials not available")
	}

	// Send start notification
	if notificationSystem.IsConfigured() {
		if err := notificationSystem.SendTestStartNotification(len(platformTests), testRunID); err != nil {
			t.Logf("⚠️  Failed to send start notification: %v", err)
		}
	}

	// Run all platform tests in parallel
	t.Logf("🚀 Starting parallel execution of %d platform installers", len(platformTests))
	results := runner.RunPlatformTests(t, platformTests)

	// Send individual failure notifications
	if notificationSystem.IsConfigured() {
		for _, result := range results {
			if !result.Success && result.Error != nil {
				if err := notificationSystem.SendPlatformFailureNotification(result.Platform, result.Error, testRunID); err != nil {
					t.Logf("⚠️  Failed to send failure notification for %s: %v", result.Platform, err)
				}
			}
		}
	}

	// Generate comprehensive report with detailed metadata
	reporter := NewTestReporter("test-results")

	metadata := ReportMetadata{
		TestRunID:      testRunID,
		Timestamp:      time.Now(),
		ExecutionMode:  "parallel",
		MaxConcurrency: runner.MaxConcurrency,
		TotalTimeout:   runner.Timeout,
		Environment: map[string]string{
			"PULUMI_ACCESS_TOKEN": maskToken(os.Getenv("PULUMI_ACCESS_TOKEN")),
			"AWS_REGION":          os.Getenv("AWS_REGION"),
			"AZURE_LOCATION":      os.Getenv("AZURE_LOCATION"),
			"GOOGLE_PROJECT":      os.Getenv("GOOGLE_PROJECT"),
		},
	}

	report, err := reporter.GenerateReport(results, metadata)
	if err != nil {
		t.Errorf("Failed to generate test report: %v", err)
	} else {
		// Save report in multiple formats
		if err := reporter.SaveReport(report); err != nil {
			t.Errorf("Failed to save test report: %v", err)
		} else {
			t.Logf("📄 Test reports saved to: %s", reporter.OutputDir)
		}
	}

	// Log summary to console
	t.Logf("📊 Test execution completed:")
	t.Logf("   • Total platforms: %d", report.Summary.TotalPlatforms)
	t.Logf("   • Successful: %d", report.Summary.SuccessfulPlatforms)
	t.Logf("   • Failed: %d", report.Summary.FailedPlatforms)
	t.Logf("   • Success rate: %.1f%%", report.Summary.SuccessRate)
	t.Logf("   • Total duration: %v", report.Summary.TotalDuration)
	t.Logf("   • Parallel efficiency: %.1fx speedup", report.Insights.ResourceEfficiency)

	// Log insights and recommendations
	if len(report.Insights.Recommendations) > 0 {
		t.Logf("💡 Recommendations:")
		for _, rec := range report.Insights.Recommendations {
			t.Logf("   • %s", rec)
		}
	}

	// Fail the test if any platform failed
	if report.Summary.FailedPlatforms > 0 {
		t.Errorf("❌ %d platform(s) failed testing", report.Summary.FailedPlatforms)

		// Log detailed failure information
		for _, result := range results {
			if !result.Success {
				t.Errorf("   • %s failed: %v", result.Platform, result.Error)
			}
		}
	} else {
		t.Logf("✅ All platforms passed testing successfully!")
	}

	// Send completion notification
	if notificationSystem.IsConfigured() {
		if err := notificationSystem.SendTestCompletionNotification(report); err != nil {
			t.Logf("⚠️  Failed to send completion notification: %v", err)
		}
	}
}

// runAwsEksTestWithMetrics runs the AWS EKS test with metrics collection
func runAwsEksTestWithMetrics(t *testing.T, metricsCollector *MetricsCollector) *TestResult {
	return runAwsEksTestInternal(t, metricsCollector)
}

// runAwsEksTest runs the AWS EKS test and returns a result (legacy version)
func runAwsEksTest(t *testing.T) *TestResult {
	return runAwsEksTestInternal(t, nil)
}

// runAwsEksTestInternal contains the actual test logic
func runAwsEksTestInternal(t *testing.T, metricsCollector *MetricsCollector) *TestResult {
	result := &TestResult{
		Platform:  "aws-eks",
		StartTime: time.Now(),
	}

	defer func() {
		result.EndTime = time.Now()
		result.Duration = result.EndTime.Sub(result.StartTime)

		if r := recover(); r != nil {
			result.Success = false
			result.Error = fmt.Errorf("test panicked: %v", r)
		}
	}()

	// Check environment variables
	if !hasAwsCredentials() {
		result.Success = false
		result.Error = fmt.Errorf("AWS credentials not available")
		return result
	}

	// Create isolated test environment
	env := NewTestEnvironment(t, "aws-eks")
	defer env.Destroy(t)

	basePath := "../eks-hosted"
	var emptyConfig map[string]string

	stages := []string{
		"01-iam", "02-networking", "05-eks-cluster", "10-cluster-svcs",
		"15-state-policies-mgmt", "20-database", "25-insights", "30-esc", "90-pulumi-service",
	}

	result.Stages = make([]StageResult, 0, len(stages))

	// Run each stage
	for _, stage := range stages {
		stageResult := StageResult{
			Name:      stage,
			StartTime: time.Now(),
		}

		func() {
			defer func() {
				stageResult.EndTime = time.Now()
				stageResult.Duration = stageResult.EndTime.Sub(stageResult.StartTime)
				result.Stages = append(result.Stages, stageResult)

				// Record stage metrics
				if metricsCollector != nil {
					errorMsg := ""
					if stageResult.Error != nil {
						errorMsg = stageResult.Error.Error()
					}
					metricsCollector.RecordStageResult("aws-eks", stage, stageResult.Success, stageResult.Duration, errorMsg)

					// Record stage duration
					labels := map[string]string{
						"platform": "aws-eks",
						"stage":    stage,
					}
					metricsCollector.RecordDuration(fmt.Sprintf("stage_%s_duration", stage), stageResult.Duration, labels)
				}

				if r := recover(); r != nil {
					stageResult.Success = false
					stageResult.Error = fmt.Errorf("stage panicked: %v", r)

					// Record panic as error metric
					if metricsCollector != nil {
						metricsCollector.RecordError("aws-eks", stage, "panic", fmt.Sprintf("%v", r))
					}
				}
			}()

			t.Logf("🔧 Running AWS EKS stage: %s", stage)
			_ = runCycleWithEnvironment(t, env, basePath, stage, emptyConfig)
			stageResult.Success = true
		}()

		if !stageResult.Success {
			result.Success = false
			result.Error = fmt.Errorf("stage %s failed: %v", stage, stageResult.Error)

			// Record platform failure
			if metricsCollector != nil {
				metricsCollector.RecordError("aws-eks", stage, "deployment_failure", result.Error.Error())
			}

			return result
		}
	}

	result.Success = true
	result.Metrics = env.GetMetrics()
	result.Environment = env.ID

	return result
}

// runAwsEcsTsTestWithMetrics runs the AWS ECS TypeScript test with metrics
func runAwsEcsTsTestWithMetrics(t *testing.T, metricsCollector *MetricsCollector) *TestResult {
	return runAwsEcsTsTestInternal(t, metricsCollector)
}

// runAwsEcsGoTestWithMetrics runs the AWS ECS Go test with metrics
func runAwsEcsGoTestWithMetrics(t *testing.T, metricsCollector *MetricsCollector) *TestResult {
	return runAwsEcsGoTestInternal(t, metricsCollector)
}

// runAzureAksTestWithMetrics runs the Azure AKS test with metrics
func runAzureAksTestWithMetrics(t *testing.T, metricsCollector *MetricsCollector) *TestResult {
	return runAzureAksTestInternal(t, metricsCollector)
}

// runGcpGkeTestWithMetrics runs the GCP GKE test with metrics
func runGcpGkeTestWithMetrics(t *testing.T, metricsCollector *MetricsCollector) *TestResult {
	return runGcpGkeTestInternal(t, metricsCollector)
}

// runAwsEcsTsTest runs the AWS ECS TypeScript test
func runAwsEcsTsTest(t *testing.T) *TestResult {
	return runAwsEcsTsTestInternal(t, nil)
}

func runAwsEcsTsTestInternal(t *testing.T, metricsCollector *MetricsCollector) *TestResult {
	result := &TestResult{
		Platform:  "aws-ecs-ts",
		StartTime: time.Now(),
	}

	defer func() {
		result.EndTime = time.Now()
		result.Duration = result.EndTime.Sub(result.StartTime)

		if r := recover(); r != nil {
			result.Success = false
			result.Error = fmt.Errorf("test panicked: %v", r)
		}
	}()

	if !hasAwsCredentials() {
		result.Success = false
		result.Error = fmt.Errorf("AWS credentials not available")
		return result
	}

	// Run the ECS TypeScript test
	env := NewTestEnvironment(t, "aws-ecs-ts")
	defer env.Destroy(t)

	basePath := "../ecs-hosted/ts"
	stages := []string{"infrastructure", "application", "dns"}

	result.Stages = make([]StageResult, 0, len(stages))

	for _, stage := range stages {
		stageResult := StageResult{
			Name:      stage,
			StartTime: time.Now(),
		}

		func() {
			defer func() {
				stageResult.EndTime = time.Now()
				stageResult.Duration = stageResult.EndTime.Sub(stageResult.StartTime)
				result.Stages = append(result.Stages, stageResult)

				if r := recover(); r != nil {
					stageResult.Success = false
					stageResult.Error = fmt.Errorf("stage panicked: %v", r)
				}
			}()

			t.Logf("🔧 Running AWS ECS TS stage: %s", stage)
			_ = runCycleWithEnvironment(t, env, basePath, stage, map[string]string{
				"aws:region": "us-west-2",
			})
			stageResult.Success = true
		}()

		if !stageResult.Success {
			result.Success = false
			result.Error = fmt.Errorf("stage %s failed: %v", stage, stageResult.Error)
			return result
		}
	}

	result.Success = true
	result.Metrics = env.GetMetrics()
	result.Environment = env.ID

	return result
}

// runAwsEcsGoTest runs the AWS ECS Go test
func runAwsEcsGoTest(t *testing.T) *TestResult {
	return runAwsEcsGoTestInternal(t, nil)
}

func runAwsEcsGoTestInternal(t *testing.T, metricsCollector *MetricsCollector) *TestResult {
	result := &TestResult{
		Platform:  "aws-ecs-go",
		StartTime: time.Now(),
	}

	defer func() {
		result.EndTime = time.Now()
		result.Duration = result.EndTime.Sub(result.StartTime)

		if r := recover(); r != nil {
			result.Success = false
			result.Error = fmt.Errorf("test panicked: %v", r)
		}
	}()

	if !hasAwsCredentials() {
		result.Success = false
		result.Error = fmt.Errorf("AWS credentials not available")
		return result
	}

	env := NewTestEnvironment(t, "aws-ecs-go")
	defer env.Destroy(t)

	basePath := "../ecs-hosted/go"
	stages := []string{"infrastructure", "application", "dns"}

	result.Stages = make([]StageResult, 0, len(stages))

	for _, stage := range stages {
		stageResult := StageResult{
			Name:      stage,
			StartTime: time.Now(),
		}

		func() {
			defer func() {
				stageResult.EndTime = time.Now()
				stageResult.Duration = stageResult.EndTime.Sub(stageResult.StartTime)
				result.Stages = append(result.Stages, stageResult)

				if r := recover(); r != nil {
					stageResult.Success = false
					stageResult.Error = fmt.Errorf("stage panicked: %v", r)
				}
			}()

			t.Logf("🔧 Running AWS ECS Go stage: %s", stage)
			_ = runCycleWithEnvironment(t, env, basePath, stage, map[string]string{
				"aws:region": "us-west-2",
			})
			stageResult.Success = true
		}()

		if !stageResult.Success {
			result.Success = false
			result.Error = fmt.Errorf("stage %s failed: %v", stage, stageResult.Error)
			return result
		}
	}

	result.Success = true
	result.Metrics = env.GetMetrics()
	result.Environment = env.ID

	return result
}

// runAzureAksTest runs the Azure AKS test
func runAzureAksTest(t *testing.T) *TestResult {
	return runAzureAksTestInternal(t, nil)
}

func runAzureAksTestInternal(t *testing.T, metricsCollector *MetricsCollector) *TestResult {
	result := &TestResult{
		Platform:  "azure-aks",
		StartTime: time.Now(),
	}

	defer func() {
		result.EndTime = time.Now()
		result.Duration = result.EndTime.Sub(result.StartTime)

		if r := recover(); r != nil {
			result.Success = false
			result.Error = fmt.Errorf("test panicked: %v", r)
		}
	}()

	if !hasAzureCredentials() {
		result.Success = false
		result.Error = fmt.Errorf("Azure credentials not available")
		return result
	}

	env := NewTestEnvironment(t, "azure-aks")
	defer env.Destroy(t)

	basePath := "../aks-hosted"
	stages := []string{"01-infrastructure", "02-kubernetes", "03-application"}

	result.Stages = make([]StageResult, 0, len(stages))

	for _, stage := range stages {
		stageResult := StageResult{
			Name:      stage,
			StartTime: time.Now(),
		}

		func() {
			defer func() {
				stageResult.EndTime = time.Now()
				stageResult.Duration = stageResult.EndTime.Sub(stageResult.StartTime)
				result.Stages = append(result.Stages, stageResult)

				if r := recover(); r != nil {
					stageResult.Success = false
					stageResult.Error = fmt.Errorf("stage panicked: %v", r)
				}
			}()

			t.Logf("🔧 Running Azure AKS stage: %s", stage)
			_ = runCycleWithEnvironment(t, env, basePath, stage, map[string]string{
				"azure-native:location": "East US",
			})
			stageResult.Success = true
		}()

		if !stageResult.Success {
			result.Success = false
			result.Error = fmt.Errorf("stage %s failed: %v", stage, stageResult.Error)
			return result
		}
	}

	result.Success = true
	result.Metrics = env.GetMetrics()
	result.Environment = env.ID

	return result
}

// runGcpGkeTest runs the GCP GKE test
func runGcpGkeTest(t *testing.T) *TestResult {
	return runGcpGkeTestInternal(t, nil)
}

func runGcpGkeTestInternal(t *testing.T, metricsCollector *MetricsCollector) *TestResult {
	result := &TestResult{
		Platform:  "gcp-gke",
		StartTime: time.Now(),
	}

	defer func() {
		result.EndTime = time.Now()
		result.Duration = result.EndTime.Sub(result.StartTime)

		if r := recover(); r != nil {
			result.Success = false
			result.Error = fmt.Errorf("test panicked: %v", r)
		}
	}()

	if !hasGcpCredentials() {
		result.Success = false
		result.Error = fmt.Errorf("GCP credentials not available")
		return result
	}

	env := NewTestEnvironment(t, "gcp-gke")
	defer env.Destroy(t)

	basePath := "../gke-hosted"
	stages := []string{"01-infrastructure", "02-kubernetes", "03-application"}

	result.Stages = make([]StageResult, 0, len(stages))

	for _, stage := range stages {
		stageResult := StageResult{
			Name:      stage,
			StartTime: time.Now(),
		}

		func() {
			defer func() {
				stageResult.EndTime = time.Now()
				stageResult.Duration = stageResult.EndTime.Sub(stageResult.StartTime)
				result.Stages = append(result.Stages, stageResult)

				if r := recover(); r != nil {
					stageResult.Success = false
					stageResult.Error = fmt.Errorf("stage panicked: %v", r)
				}
			}()

			t.Logf("🔧 Running GCP GKE stage: %s", stage)
			gcpProject := os.Getenv("GOOGLE_PROJECT")
			if gcpProject == "" {
				gcpProject = "pulumi-test-project"
			}

			_ = runCycleWithEnvironment(t, env, basePath, stage, map[string]string{
				"gcp:project": gcpProject,
				"gcp:region":  "us-central1",
			})
			stageResult.Success = true
		}()

		if !stageResult.Success {
			result.Success = false
			result.Error = fmt.Errorf("stage %s failed: %v", stage, stageResult.Error)
			return result
		}
	}

	result.Success = true
	result.Metrics = env.GetMetrics()
	result.Environment = env.ID

	return result
}

// Credential checking helper functions
func hasAwsCredentials() bool {
	return os.Getenv("AWS_ACCESS_KEY_ID") != "" && os.Getenv("AWS_SECRET_ACCESS_KEY") != ""
}

func hasAzureCredentials() bool {
	return os.Getenv("AZURE_CLIENT_ID") != "" &&
		os.Getenv("AZURE_CLIENT_SECRET") != "" &&
		os.Getenv("AZURE_TENANT_ID") != "" &&
		os.Getenv("AZURE_SUBSCRIPTION_ID") != ""
}

func hasGcpCredentials() bool {
	return (os.Getenv("GOOGLE_APPLICATION_CREDENTIALS") != "" ||
		os.Getenv("GOOGLE_CREDENTIALS") != "") &&
		os.Getenv("GOOGLE_PROJECT") != ""
}

// maskToken masks sensitive tokens for reporting
func maskToken(token string) string {
	if token == "" {
		return ""
	}
	if len(token) <= 8 {
		return "***"
	}
	return token[:4] + strings.Repeat("*", len(token)-8) + token[len(token)-4:]
}
