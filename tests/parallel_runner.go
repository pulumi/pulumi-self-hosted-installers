package tests

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"
)

// TestResult represents the result of a single test execution
type TestResult struct {
	Platform    string                 `json:"platform"`
	Success     bool                   `json:"success"`
	Duration    time.Duration          `json:"duration"`
	Error       error                  `json:"error,omitempty"`
	StartTime   time.Time              `json:"start_time"`
	EndTime     time.Time              `json:"end_time"`
	Metrics     map[string]interface{} `json:"metrics,omitempty"`
	Environment string                 `json:"environment,omitempty"`
	Stages      []StageResult          `json:"stages,omitempty"`
}

// StageResult represents the result of a single deployment stage
type StageResult struct {
	Name      string        `json:"name"`
	Success   bool          `json:"success"`
	Duration  time.Duration `json:"duration"`
	Error     error         `json:"error,omitempty"`
	StartTime time.Time     `json:"start_time"`
	EndTime   time.Time     `json:"end_time"`
}

// PlatformTestFunc represents a function that runs tests for a specific platform
type PlatformTestFunc func(t *testing.T) *TestResult

// ParallelTestRunner manages parallel execution of platform tests
type ParallelTestRunner struct {
	MaxConcurrency int
	Timeout        time.Duration
	Results        []TestResult
	mutex          sync.Mutex
}

// NewParallelTestRunner creates a new parallel test runner
func NewParallelTestRunner(maxConcurrency int, timeout time.Duration) *ParallelTestRunner {
	return &ParallelTestRunner{
		MaxConcurrency: maxConcurrency,
		Timeout:        timeout,
		Results:        make([]TestResult, 0),
	}
}

// RunPlatformTests executes multiple platform tests in parallel
func (runner *ParallelTestRunner) RunPlatformTests(t *testing.T, tests map[string]PlatformTestFunc) []TestResult {
	ctx, cancel := context.WithTimeout(context.Background(), runner.Timeout)
	defer cancel()

	// Create buffered channel to limit concurrency
	semaphore := make(chan struct{}, runner.MaxConcurrency)

	// WaitGroup to wait for all tests to complete
	var wg sync.WaitGroup

	// Channel to collect results
	resultsChan := make(chan TestResult, len(tests))

	t.Logf("🚀 Starting parallel execution of %d platform tests (max concurrency: %d)", len(tests), runner.MaxConcurrency)

	// Start tests
	for platform, testFunc := range tests {
		wg.Add(1)
		go func(platform string, testFunc PlatformTestFunc) {
			defer wg.Done()

			// Acquire semaphore (limit concurrency)
			select {
			case semaphore <- struct{}{}:
				defer func() { <-semaphore }() // Release semaphore
			case <-ctx.Done():
				resultsChan <- TestResult{
					Platform:  platform,
					Success:   false,
					Error:     fmt.Errorf("test cancelled due to timeout (duration: %v)", runner.Timeout),
					StartTime: time.Now(),
					EndTime:   time.Now(),
				}
				return
			}

			// Run the test with timeout
			result := runner.runSinglePlatformTest(ctx, t, platform, testFunc)
			resultsChan <- result
		}(platform, testFunc)
	}

	// Close results channel after all goroutines complete
	go func() {
		wg.Wait()
		close(resultsChan)
	}()

	// Collect results
	results := make([]TestResult, 0, len(tests))
	for result := range resultsChan {
		results = append(results, result)
		t.Logf("📊 Platform %s completed: success=%t, duration=%v", result.Platform, result.Success, result.Duration)
	}

	// Store results in runner
	runner.mutex.Lock()
	runner.Results = results
	runner.mutex.Unlock()

	// Log summary
	successCount := 0
	for _, result := range results {
		if result.Success {
			successCount++
		}
	}

	t.Logf("✅ Parallel execution completed: %d/%d platforms succeeded", successCount, len(results))

	return results
}

// runSinglePlatformTest executes a single platform test with proper isolation
func (runner *ParallelTestRunner) runSinglePlatformTest(ctx context.Context, parentT *testing.T, platform string, testFunc PlatformTestFunc) TestResult {
	startTime := time.Now()

	// Create sub-test for isolation
	var result *TestResult
	var testPanic interface{}

	// Run test in sub-test to capture any panics
	parentT.Run(fmt.Sprintf("Parallel-%s", platform), func(t *testing.T) {
		defer func() {
			if r := recover(); r != nil {
				testPanic = r
			}
		}()

		// Create context-aware test
		done := make(chan struct{})
		go func() {
			defer close(done)
			result = testFunc(t)
		}()

		// Wait for test completion or context cancellation
		select {
		case <-done:
			// Test completed normally
		case <-ctx.Done():
			// Test timed out
			elapsed := time.Since(startTime)
			result = &TestResult{
				Platform:  platform,
				Success:   false,
				Error:     fmt.Errorf("test timed out after %v (configured timeout: %v)", elapsed, runner.Timeout),
				StartTime: startTime,
				EndTime:   time.Now(),
			}
		}
	})

	endTime := time.Now()
	duration := endTime.Sub(startTime)

	// Handle panic case
	if testPanic != nil {
		return TestResult{
			Platform:  platform,
			Success:   false,
			Error:     fmt.Errorf("test panicked: %v", testPanic),
			StartTime: startTime,
			EndTime:   endTime,
			Duration:  duration,
		}
	}

	// Ensure we have a result
	if result == nil {
		return TestResult{
			Platform:  platform,
			Success:   false,
			Error:     fmt.Errorf("test did not return a result"),
			StartTime: startTime,
			EndTime:   endTime,
			Duration:  duration,
		}
	}

	// Update timing information
	result.StartTime = startTime
	result.EndTime = endTime
	result.Duration = duration

	return *result
}

// GetResults returns the collected test results
func (runner *ParallelTestRunner) GetResults() []TestResult {
	runner.mutex.Lock()
	defer runner.mutex.Unlock()

	// Return a copy to prevent external modification
	results := make([]TestResult, len(runner.Results))
	copy(results, runner.Results)
	return results
}

// GetSuccessRate returns the success rate as a percentage
func (runner *ParallelTestRunner) GetSuccessRate() float64 {
	results := runner.GetResults()
	if len(results) == 0 {
		return 0.0
	}

	successCount := 0
	for _, result := range results {
		if result.Success {
			successCount++
		}
	}

	return float64(successCount) / float64(len(results)) * 100.0
}

// GetTotalDuration returns the total wall-clock time for all tests
func (runner *ParallelTestRunner) GetTotalDuration() time.Duration {
	results := runner.GetResults()
	if len(results) == 0 {
		return 0
	}

	var earliest, latest time.Time
	for i, result := range results {
		if i == 0 {
			earliest = result.StartTime
			latest = result.EndTime
		} else {
			if result.StartTime.Before(earliest) {
				earliest = result.StartTime
			}
			if result.EndTime.After(latest) {
				latest = result.EndTime
			}
		}
	}

	return latest.Sub(earliest)
}

// GenerateReport creates a detailed test report
func (runner *ParallelTestRunner) GenerateReport() map[string]interface{} {
	results := runner.GetResults()

	report := map[string]interface{}{
		"total_platforms":      len(results),
		"successful_platforms": 0,
		"failed_platforms":     0,
		"success_rate":         runner.GetSuccessRate(),
		"total_duration":       runner.GetTotalDuration(),
		"max_concurrency":      runner.MaxConcurrency,
		"timeout":              runner.Timeout,
		"timestamp":            time.Now(),
		"platform_results":     results,
	}

	// Count successes and failures
	for _, result := range results {
		if result.Success {
			report["successful_platforms"] = report["successful_platforms"].(int) + 1
		} else {
			report["failed_platforms"] = report["failed_platforms"].(int) + 1
		}
	}

	return report
}
