package tests

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

// MetricType represents different types of metrics we collect
type MetricType string

const (
	MetricDuration      MetricType = "duration"
	MetricResourceUsage MetricType = "resource_usage"
	MetricStageResult   MetricType = "stage_result"
	MetricSystemInfo    MetricType = "system_info"
	MetricError         MetricType = "error"
	MetricPerformance   MetricType = "performance"
)

// Metric represents a single metric data point
type Metric struct {
	Timestamp time.Time              `json:"timestamp"`
	Type      MetricType             `json:"type"`
	Name      string                 `json:"name"`
	Value     interface{}            `json:"value"`
	Unit      string                 `json:"unit,omitempty"`
	Labels    map[string]string      `json:"labels,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
	TestRunID string                 `json:"test_run_id,omitempty"`
	Platform  string                 `json:"platform,omitempty"`
	Stage     string                 `json:"stage,omitempty"`
}

// SystemMetrics represents system resource usage metrics
type SystemMetrics struct {
	CPUUsagePercent    float64 `json:"cpu_usage_percent"`
	MemoryUsageMB      uint64  `json:"memory_usage_mb"`
	MemoryTotalMB      uint64  `json:"memory_total_mb"`
	MemoryUsagePercent float64 `json:"memory_usage_percent"`
	GoroutineCount     int     `json:"goroutine_count"`
	GCCount            uint32  `json:"gc_count"`
	AllocatedMB        uint64  `json:"allocated_mb"`
}

// PerformanceMetrics represents performance benchmarks
type PerformanceMetrics struct {
	ThroughputOpsPerSec  float64       `json:"throughput_ops_per_sec"`
	LatencyP50           time.Duration `json:"latency_p50"`
	LatencyP95           time.Duration `json:"latency_p95"`
	LatencyP99           time.Duration `json:"latency_p99"`
	ErrorRate            float64       `json:"error_rate"`
	ConcurrentOperations int           `json:"concurrent_operations"`
}

// MetricsCollector handles collection, aggregation, and storage of test metrics
type MetricsCollector struct {
	metrics     []Metric
	mutex       sync.RWMutex
	testRunID   string
	startTime   time.Time
	outputDir   string
	systemStats *SystemStatsCollector
}

// SystemStatsCollector collects system resource metrics periodically
type SystemStatsCollector struct {
	collector *MetricsCollector
	stopChan  chan struct{}
	interval  time.Duration
	running   bool
	mutex     sync.Mutex
}

// NewMetricsCollector creates a new metrics collector
func NewMetricsCollector(testRunID string, outputDir string) *MetricsCollector {
	collector := &MetricsCollector{
		metrics:   make([]Metric, 0),
		testRunID: testRunID,
		startTime: time.Now(),
		outputDir: outputDir,
	}

	// Initialize system stats collector
	collector.systemStats = &SystemStatsCollector{
		collector: collector,
		stopChan:  make(chan struct{}),
		interval:  30 * time.Second, // Collect system stats every 30 seconds
	}

	return collector
}

// StartSystemMetricsCollection begins periodic collection of system metrics
func (mc *MetricsCollector) StartSystemMetricsCollection() {
	mc.systemStats.Start()
}

// StopSystemMetricsCollection stops periodic collection of system metrics
func (mc *MetricsCollector) StopSystemMetricsCollection() {
	mc.systemStats.Stop()
}

// RecordDuration records a duration metric
func (mc *MetricsCollector) RecordDuration(name string, duration time.Duration, labels map[string]string) {
	mc.addMetric(Metric{
		Timestamp: time.Now(),
		Type:      MetricDuration,
		Name:      name,
		Value:     duration.Nanoseconds(),
		Unit:      "nanoseconds",
		Labels:    labels,
		TestRunID: mc.testRunID,
		Platform:  labels["platform"],
		Stage:     labels["stage"],
	})
}

// RecordStageResult records the result of a deployment stage
func (mc *MetricsCollector) RecordStageResult(platform, stage string, success bool, duration time.Duration, errorMsg string) {
	labels := map[string]string{
		"platform": platform,
		"stage":    stage,
		"success":  fmt.Sprintf("%t", success),
	}

	metadata := map[string]interface{}{
		"duration_seconds": duration.Seconds(),
	}

	if errorMsg != "" {
		metadata["error"] = errorMsg
	}

	mc.addMetric(Metric{
		Timestamp: time.Now(),
		Type:      MetricStageResult,
		Name:      "stage_completion",
		Value:     success,
		Labels:    labels,
		Metadata:  metadata,
		TestRunID: mc.testRunID,
		Platform:  platform,
		Stage:     stage,
	})
}

// RecordSystemMetrics records current system resource usage
func (mc *MetricsCollector) RecordSystemMetrics() {
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	sysMetrics := SystemMetrics{
		MemoryUsageMB:  memStats.Alloc / 1024 / 1024,
		MemoryTotalMB:  memStats.Sys / 1024 / 1024,
		GoroutineCount: runtime.NumGoroutine(),
		GCCount:        memStats.NumGC,
		AllocatedMB:    memStats.TotalAlloc / 1024 / 1024,
	}

	// Calculate memory usage percentage (rough estimate)
	if sysMetrics.MemoryTotalMB > 0 {
		sysMetrics.MemoryUsagePercent = float64(sysMetrics.MemoryUsageMB) / float64(sysMetrics.MemoryTotalMB) * 100.0
	}

	mc.addMetric(Metric{
		Timestamp: time.Now(),
		Type:      MetricSystemInfo,
		Name:      "system_resources",
		Value:     sysMetrics,
		TestRunID: mc.testRunID,
	})
}

// RecordPerformanceMetrics records performance benchmark metrics
func (mc *MetricsCollector) RecordPerformanceMetrics(platform string, perfMetrics PerformanceMetrics) {
	labels := map[string]string{
		"platform": platform,
	}

	mc.addMetric(Metric{
		Timestamp: time.Now(),
		Type:      MetricPerformance,
		Name:      "performance_benchmark",
		Value:     perfMetrics,
		Labels:    labels,
		TestRunID: mc.testRunID,
		Platform:  platform,
	})
}

// RecordError records error metrics
func (mc *MetricsCollector) RecordError(platform, stage, errorType, errorMsg string) {
	labels := map[string]string{
		"platform":   platform,
		"stage":      stage,
		"error_type": errorType,
	}

	metadata := map[string]interface{}{
		"error_message": errorMsg,
	}

	mc.addMetric(Metric{
		Timestamp: time.Now(),
		Type:      MetricError,
		Name:      "error_occurrence",
		Value:     1,
		Labels:    labels,
		Metadata:  metadata,
		TestRunID: mc.testRunID,
		Platform:  platform,
		Stage:     stage,
	})
}

// addMetric safely adds a metric to the collection
func (mc *MetricsCollector) addMetric(metric Metric) {
	mc.mutex.Lock()
	defer mc.mutex.Unlock()
	mc.metrics = append(mc.metrics, metric)
}

// GetMetrics returns a copy of all collected metrics
func (mc *MetricsCollector) GetMetrics() []Metric {
	mc.mutex.RLock()
	defer mc.mutex.RUnlock()

	// Return a copy to prevent external modification
	metrics := make([]Metric, len(mc.metrics))
	copy(metrics, mc.metrics)
	return metrics
}

// GetMetricsSummary returns aggregated metrics summary
func (mc *MetricsCollector) GetMetricsSummary() map[string]interface{} {
	metrics := mc.GetMetrics()

	summary := map[string]interface{}{
		"total_metrics":     len(metrics),
		"collection_period": time.Since(mc.startTime),
		"test_run_id":       mc.testRunID,
		"metrics_by_type":   make(map[string]int),
		"platforms":         make(map[string]int),
		"stages":            make(map[string]int),
	}

	// Aggregate by type, platform, and stage
	metricsByType := summary["metrics_by_type"].(map[string]int)
	platforms := summary["platforms"].(map[string]int)
	stages := summary["stages"].(map[string]int)

	for _, metric := range metrics {
		metricsByType[string(metric.Type)]++
		if metric.Platform != "" {
			platforms[metric.Platform]++
		}
		if metric.Stage != "" {
			stages[metric.Stage]++
		}
	}

	return summary
}

// SaveMetrics saves all collected metrics to disk in JSON format
func (mc *MetricsCollector) SaveMetrics() error {
	if err := os.MkdirAll(mc.outputDir, 0755); err != nil {
		return fmt.Errorf("failed to create metrics output directory: %w", err)
	}

	// Save raw metrics
	metricsFile := filepath.Join(mc.outputDir, "metrics.json")
	if err := mc.saveMetricsToFile(metricsFile); err != nil {
		return fmt.Errorf("failed to save metrics: %w", err)
	}

	// Save metrics summary
	summaryFile := filepath.Join(mc.outputDir, "metrics-summary.json")
	if err := mc.saveSummaryToFile(summaryFile); err != nil {
		return fmt.Errorf("failed to save metrics summary: %w", err)
	}

	// Save metrics in CSV format for analysis
	csvFile := filepath.Join(mc.outputDir, "metrics.csv")
	if err := mc.saveMetricsToCSV(csvFile); err != nil {
		return fmt.Errorf("failed to save metrics CSV: %w", err)
	}

	return nil
}

// saveMetricsToFile saves raw metrics to JSON file
func (mc *MetricsCollector) saveMetricsToFile(filename string) error {
	metrics := mc.GetMetrics()

	data, err := json.MarshalIndent(metrics, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filename, data, 0644)
}

// saveSummaryToFile saves metrics summary to JSON file
func (mc *MetricsCollector) saveSummaryToFile(filename string) error {
	summary := mc.GetMetricsSummary()

	data, err := json.MarshalIndent(summary, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filename, data, 0644)
}

// saveMetricsToCSV saves metrics in CSV format for data analysis
func (mc *MetricsCollector) saveMetricsToCSV(filename string) error {
	metrics := mc.GetMetrics()

	file, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer func() {
		if err := file.Close(); err != nil {
			fmt.Printf("Error closing metrics file: %v\n", err)
		}
	}()

	// Write CSV header
	if _, err := file.WriteString("timestamp,type,name,value,unit,platform,stage,test_run_id\n"); err != nil {
		return fmt.Errorf("failed to write CSV header: %w", err)
	}

	// Write metrics data
	for _, metric := range metrics {
		valueStr := fmt.Sprintf("%v", metric.Value)

		if _, err := fmt.Fprintf(file, "%s,%s,%s,%s,%s,%s,%s,%s\n",
			metric.Timestamp.Format(time.RFC3339),
			string(metric.Type),
			metric.Name,
			valueStr,
			metric.Unit,
			metric.Platform,
			metric.Stage,
			metric.TestRunID,
		); err != nil {
			return fmt.Errorf("failed to write metric data: %w", err)
		}
	}

	return nil
}

// Start begins periodic system metrics collection
func (ssc *SystemStatsCollector) Start() {
	ssc.mutex.Lock()
	defer ssc.mutex.Unlock()

	if ssc.running {
		return
	}

	ssc.running = true
	go ssc.collectLoop()
}

// Stop ends periodic system metrics collection
func (ssc *SystemStatsCollector) Stop() {
	ssc.mutex.Lock()
	defer ssc.mutex.Unlock()

	if !ssc.running {
		return
	}

	ssc.running = false
	close(ssc.stopChan)
}

// collectLoop runs the periodic collection loop
func (ssc *SystemStatsCollector) collectLoop() {
	ticker := time.NewTicker(ssc.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			ssc.collector.RecordSystemMetrics()
		case <-ssc.stopChan:
			return
		}
	}
}
