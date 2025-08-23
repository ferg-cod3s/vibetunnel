package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Memory statistics
type MemoryStats struct {
	Timestamp  time.Time
	RSS        uint64 // Resident Set Size (KB)
	VSZ        uint64 // Virtual Memory Size (KB)
	CPUPercent float64
	GoMemStats runtime.MemStats
}

type MemoryMonitor struct {
	ProcessName string
	PID         int
	Stats       []MemoryStats
	Interval    time.Duration
	Duration    time.Duration
}

func main() {
	var (
		processName = flag.String("process", "tunnelforge", "Process name to monitor")
		pid         = flag.Int("pid", 0, "Process ID to monitor (overrides process name)")
		interval    = flag.Duration("interval", 1*time.Second, "Monitoring interval")
		duration    = flag.Duration("duration", 60*time.Second, "Monitoring duration")
		output      = flag.String("output", "", "Output file for results (optional)")
	)
	flag.Parse()

	monitor := &MemoryMonitor{
		ProcessName: *processName,
		PID:         *pid,
		Interval:    *interval,
		Duration:    *duration,
		Stats:       make([]MemoryStats, 0),
	}

	// Find process if PID not provided
	if monitor.PID == 0 {
		var err error
		monitor.PID, err = findProcessByName(monitor.ProcessName)
		if err != nil {
			log.Fatalf("Failed to find process '%s': %v", monitor.ProcessName, err)
		}
	}

	fmt.Printf("🔍 Memory Monitor Configuration:\n")
	fmt.Printf("   Process: %s (PID: %d)\n", monitor.ProcessName, monitor.PID)
	fmt.Printf("   Interval: %v\n", monitor.Interval)
	fmt.Printf("   Duration: %v\n", monitor.Duration)
	fmt.Printf("   Samples: %d\n", int(monitor.Duration/monitor.Interval))
	fmt.Printf("\n")

	// Start monitoring
	fmt.Printf("📊 Starting memory monitoring...\n")
	err := monitor.Run()
	if err != nil {
		log.Fatalf("Monitoring failed: %v", err)
	}

	// Print results
	monitor.PrintResults()

	// Save to file if requested
	if *output != "" {
		err = monitor.SaveToFile(*output)
		if err != nil {
			log.Printf("Failed to save results: %v", err)
		} else {
			fmt.Printf("💾 Results saved to %s\n", *output)
		}
	}
}

func findProcessByName(name string) (int, error) {
	cmd := exec.Command("pgrep", "-f", name)
	output, err := cmd.Output()
	if err != nil {
		return 0, fmt.Errorf("process not found: %v", err)
	}

	pidStr := strings.TrimSpace(string(output))
	lines := strings.Split(pidStr, "\n")

	// Take the first PID if multiple processes found
	pid, err := strconv.Atoi(lines[0])
	if err != nil {
		return 0, fmt.Errorf("invalid PID: %v", err)
	}

	return pid, nil
}

func (m *MemoryMonitor) Run() error {
	ticker := time.NewTicker(m.Interval)
	defer ticker.Stop()

	timeout := time.After(m.Duration)

	// Take initial sample
	stat, err := m.takeSample()
	if err != nil {
		return fmt.Errorf("initial sample failed: %v", err)
	}
	m.Stats = append(m.Stats, stat)
	fmt.Printf("⏱️  Sample 1: RSS=%dMB VSZ=%dMB CPU=%.1f%% GoHeap=%dMB\n",
		stat.RSS/1024, stat.VSZ/1024, stat.CPUPercent,
		stat.GoMemStats.HeapAlloc/(1024*1024))

	sampleCount := 1

	for {
		select {
		case <-timeout:
			fmt.Printf("\n✅ Monitoring completed (%d samples collected)\n\n", len(m.Stats))
			return nil
		case <-ticker.C:
			stat, err := m.takeSample()
			if err != nil {
				log.Printf("Sample failed: %v", err)
				continue
			}

			m.Stats = append(m.Stats, stat)
			sampleCount++

			fmt.Printf("⏱️  Sample %d: RSS=%dMB VSZ=%dMB CPU=%.1f%% GoHeap=%dMB\n",
				sampleCount, stat.RSS/1024, stat.VSZ/1024, stat.CPUPercent,
				stat.GoMemStats.HeapAlloc/(1024*1024))
		}
	}
}

func (m *MemoryMonitor) takeSample() (MemoryStats, error) {
	stat := MemoryStats{
		Timestamp: time.Now(),
	}

	// Get system memory stats using ps
	cmd := exec.Command("ps", "-p", strconv.Itoa(m.PID), "-o", "rss=,vsz=,pcpu=")
	output, err := cmd.Output()
	if err != nil {
		return stat, fmt.Errorf("ps command failed: %v", err)
	}

	line := strings.TrimSpace(string(output))
	fields := strings.Fields(line)
	if len(fields) >= 3 {
		if rss, err := strconv.ParseUint(fields[0], 10, 64); err == nil {
			stat.RSS = rss
		}
		if vsz, err := strconv.ParseUint(fields[1], 10, 64); err == nil {
			stat.VSZ = vsz
		}
		if cpu, err := strconv.ParseFloat(fields[2], 64); err == nil {
			stat.CPUPercent = cpu
		}
	}

	// Get Go runtime memory stats (if monitoring a Go process)
	runtime.ReadMemStats(&stat.GoMemStats)

	return stat, nil
}

func (m *MemoryMonitor) PrintResults() {
	if len(m.Stats) == 0 {
		fmt.Printf("❌ No data collected\n")
		return
	}

	fmt.Printf("📈 Memory Usage Analysis:\n")
	fmt.Printf("════════════════════════════════════════\n")

	// Calculate statistics
	var (
		totalRSS, maxRSS, minRSS    = uint64(0), uint64(0), uint64(^uint64(0))
		totalVSZ, maxVSZ, minVSZ    = uint64(0), uint64(0), uint64(^uint64(0))
		totalCPU, maxCPU, minCPU    = 0.0, 0.0, 100.0
		totalHeap, maxHeap, minHeap = uint64(0), uint64(0), uint64(^uint64(0))
		totalSys, maxSys, minSys    = uint64(0), uint64(0), uint64(^uint64(0))
	)

	for _, stat := range m.Stats {
		// RSS stats
		totalRSS += stat.RSS
		if stat.RSS > maxRSS {
			maxRSS = stat.RSS
		}
		if stat.RSS < minRSS {
			minRSS = stat.RSS
		}

		// VSZ stats
		totalVSZ += stat.VSZ
		if stat.VSZ > maxVSZ {
			maxVSZ = stat.VSZ
		}
		if stat.VSZ < minVSZ {
			minVSZ = stat.VSZ
		}

		// CPU stats
		totalCPU += stat.CPUPercent
		if stat.CPUPercent > maxCPU {
			maxCPU = stat.CPUPercent
		}
		if stat.CPUPercent < minCPU {
			minCPU = stat.CPUPercent
		}

		// Go heap stats
		totalHeap += stat.GoMemStats.HeapAlloc
		if stat.GoMemStats.HeapAlloc > maxHeap {
			maxHeap = stat.GoMemStats.HeapAlloc
		}
		if stat.GoMemStats.HeapAlloc < minHeap {
			minHeap = stat.GoMemStats.HeapAlloc
		}

		// Go system stats
		totalSys += stat.GoMemStats.Sys
		if stat.GoMemStats.Sys > maxSys {
			maxSys = stat.GoMemStats.Sys
		}
		if stat.GoMemStats.Sys < minSys {
			minSys = stat.GoMemStats.Sys
		}
	}

	count := len(m.Stats)

	fmt.Printf("📊 System Memory (RSS - Resident Set Size):\n")
	fmt.Printf("   Average: %d MB\n", (totalRSS/uint64(count))/1024)
	fmt.Printf("   Maximum: %d MB\n", maxRSS/1024)
	fmt.Printf("   Minimum: %d MB\n", minRSS/1024)

	fmt.Printf("\n📊 Virtual Memory (VSZ):\n")
	fmt.Printf("   Average: %d MB\n", (totalVSZ/uint64(count))/1024)
	fmt.Printf("   Maximum: %d MB\n", maxVSZ/1024)
	fmt.Printf("   Minimum: %d MB\n", minVSZ/1024)

	fmt.Printf("\n📊 CPU Usage:\n")
	fmt.Printf("   Average: %.2f%%\n", totalCPU/float64(count))
	fmt.Printf("   Maximum: %.2f%%\n", maxCPU)
	fmt.Printf("   Minimum: %.2f%%\n", minCPU)

	fmt.Printf("\n📊 Go Runtime Memory:\n")
	fmt.Printf("   Heap Average: %d MB\n", (totalHeap/uint64(count))/(1024*1024))
	fmt.Printf("   Heap Maximum: %d MB\n", maxHeap/(1024*1024))
	fmt.Printf("   Heap Minimum: %d MB\n", minHeap/(1024*1024))
	fmt.Printf("   System Average: %d MB\n", (totalSys/uint64(count))/(1024*1024))
	fmt.Printf("   System Maximum: %d MB\n", maxSys/(1024*1024))

	// Performance evaluation
	fmt.Printf("\n🎯 Performance Targets:\n")
	avgRSSMB := (totalRSS / uint64(count)) / 1024
	maxRSSMB := maxRSS / 1024
	avgHeapMB := (totalHeap / uint64(count)) / (1024 * 1024)

	if avgRSSMB < 100 {
		fmt.Printf("   ✅ Average RSS < 100MB: ACHIEVED (%d MB)\n", avgRSSMB)
	} else {
		fmt.Printf("   ❌ Average RSS < 100MB: MISSED (%d MB)\n", avgRSSMB)
	}

	if maxRSSMB < 200 {
		fmt.Printf("   ✅ Maximum RSS < 200MB: ACHIEVED (%d MB)\n", maxRSSMB)
	} else {
		fmt.Printf("   ❌ Maximum RSS < 200MB: MISSED (%d MB)\n", maxRSSMB)
	}

	if avgHeapMB < 50 {
		fmt.Printf("   ✅ Average Go Heap < 50MB: ACHIEVED (%d MB)\n", avgHeapMB)
	} else {
		fmt.Printf("   ❌ Average Go Heap < 50MB: MISSED (%d MB)\n", avgHeapMB)
	}

	fmt.Printf("\n")
}

func (m *MemoryMonitor) SaveToFile(filename string) error {
	file, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer file.Close()

	// Write CSV header
	fmt.Fprintf(file, "Timestamp,RSS_KB,VSZ_KB,CPU_Percent,Go_Heap_Bytes,Go_Sys_Bytes,Go_GC_Cycles\n")

	// Write data
	for _, stat := range m.Stats {
		fmt.Fprintf(file, "%s,%d,%d,%.2f,%d,%d,%d\n",
			stat.Timestamp.Format(time.RFC3339),
			stat.RSS,
			stat.VSZ,
			stat.CPUPercent,
			stat.GoMemStats.HeapAlloc,
			stat.GoMemStats.Sys,
			stat.GoMemStats.NumGC,
		)
	}

	return nil
}
