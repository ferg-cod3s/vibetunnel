#!/bin/bash

# TunnelForge Go Server Benchmark Suite
# This script runs comprehensive performance tests for the Go server

set -e

# Configuration
GO_SERVER_URL="http://localhost:4021"
NODE_SERVER_URL="http://localhost:3000"
RESULTS_DIR="./benchmark_results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$RESULTS_DIR/benchmark_report_${TIMESTAMP}.md"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_dependencies() {
    log_info "Checking dependencies..."
    
    if ! command -v go &> /dev/null; then
        log_error "Go is not installed"
        exit 1
    fi
    
    if ! command -v pgrep &> /dev/null; then
        log_error "pgrep is not available"
        exit 1
    fi
    
    if ! command -v ps &> /dev/null; then
        log_error "ps is not available"  
        exit 1
    fi
    
    log_success "All dependencies available"
}

setup_results_directory() {
    log_info "Setting up results directory..."
    mkdir -p "$RESULTS_DIR"
    rm -f "$RESULTS_DIR"/*.json "$RESULTS_DIR"/*.csv 2>/dev/null || true
    log_success "Results directory ready: $RESULTS_DIR"
}

compile_benchmarks() {
    log_info "Compiling benchmark tools..."
    
    go build -o "$RESULTS_DIR/websocket_bench" ./websocket_bench.go
    go build -o "$RESULTS_DIR/http_bench" ./http_bench.go
    go build -o "$RESULTS_DIR/mem_monitor" ./mem_monitor.go
    
    log_success "Benchmark tools compiled"
}

check_server() {
    local server_url=$1
    local server_name=$2
    
    log_info "Checking if $server_name is running at $server_url..."
    
    # Use different health endpoints for different servers
    local health_endpoint
    if [[ $server_name == "Go Server" ]]; then
        health_endpoint="/health"
    else
        health_endpoint="/api/health"
    fi
    
    if curl -sf "$server_url$health_endpoint" >/dev/null 2>&1; then
        log_success "$server_name is running"
        return 0
    else
        log_warning "$server_name is not running at $server_url"
        return 1
    fi
}

run_http_benchmarks() {
    local server_url=$1
    local server_name=$2
    local results_file="$RESULTS_DIR/http_${server_name,,}_${TIMESTAMP}.txt"
    
    log_info "Running HTTP benchmarks against $server_name..."
    
    "$RESULTS_DIR/http_bench" \
        -url="$server_url" \
        -concurrent=50 \
        -requests=1000 \
        -rps=100 \
        > "$results_file" 2>&1
    
    log_success "HTTP benchmarks completed for $server_name"
    echo "Results saved to: $results_file"
}

run_websocket_benchmarks() {
    local server_url=$1
    local server_name=$2
    local results_file="$RESULTS_DIR/websocket_${server_name,,}_${TIMESTAMP}.txt"
    
    log_info "Running WebSocket benchmarks against $server_name..."
    
    "$RESULTS_DIR/websocket_bench" \
        -url="$server_url" \
        -connections=100 \
        -duration=30s \
        -rampup=10s \
        > "$results_file" 2>&1
    
    log_success "WebSocket benchmarks completed for $server_name"
    echo "Results saved to: $results_file"
}

run_memory_monitoring() {
    local server_name=$1
    local process_name=$2
    local results_file="$RESULTS_DIR/memory_${server_name,,}_${TIMESTAMP}.csv"
    
    log_info "Starting memory monitoring for $server_name (60 seconds)..."
    
    "$RESULTS_DIR/mem_monitor" \
        -process="$process_name" \
        -duration=60s \
        -interval=1s \
        -output="$results_file" \
        > "$RESULTS_DIR/memory_${server_name,,}_${TIMESTAMP}.txt" 2>&1 &
    
    local monitor_pid=$!
    
    # Wait for monitoring to complete
    wait $monitor_pid
    
    log_success "Memory monitoring completed for $server_name"
    echo "Results saved to: $results_file"
}

generate_report() {
    log_info "Generating benchmark report..."
    
    cat > "$REPORT_FILE" << EOF
# TunnelForge Performance Benchmark Report

**Generated:** $(date)
**Test Suite Version:** 1.0
**Duration:** 60 seconds per test

## Test Configuration

### HTTP Load Tests
- Concurrent Connections: 50
- Total Requests: 1000  
- Target RPS: 100

### WebSocket Load Tests
- Concurrent Connections: 100
- Test Duration: 30 seconds
- Ramp-up Time: 10 seconds

### Memory Monitoring
- Monitoring Duration: 60 seconds
- Sample Interval: 1 second

## Results Summary

EOF

    # Add Go server results if available
    if [ -f "$RESULTS_DIR/http_go_${TIMESTAMP}.txt" ]; then
        echo "### Go Server Results" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "#### HTTP Performance" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        tail -n 20 "$RESULTS_DIR/http_go_${TIMESTAMP}.txt" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi

    if [ -f "$RESULTS_DIR/websocket_go_${TIMESTAMP}.txt" ]; then
        echo "#### WebSocket Performance" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        tail -n 20 "$RESULTS_DIR/websocket_go_${TIMESTAMP}.txt" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi

    if [ -f "$RESULTS_DIR/memory_go_${TIMESTAMP}.txt" ]; then
        echo "#### Memory Usage" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        tail -n 20 "$RESULTS_DIR/memory_go_${TIMESTAMP}.txt" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi

    # Add Node.js server results if available
    if [ -f "$RESULTS_DIR/http_node_${TIMESTAMP}.txt" ]; then
        echo "### Node.js Server Results" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "#### HTTP Performance" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        tail -n 20 "$RESULTS_DIR/http_node_${TIMESTAMP}.txt" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi

    if [ -f "$RESULTS_DIR/websocket_node_${TIMESTAMP}.txt" ]; then
        echo "#### WebSocket Performance" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        tail -n 20 "$RESULTS_DIR/websocket_node_${TIMESTAMP}.txt" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi

    # Add recommendations
    cat >> "$REPORT_FILE" << EOF

## Performance Analysis

### Key Metrics to Review
1. **HTTP Response Times**: Target <50ms average, <200ms maximum
2. **WebSocket Response Times**: Target <10ms average  
3. **Memory Usage**: Target <100MB average RSS, <200MB maximum
4. **Connection Handling**: Target 100+ concurrent connections
5. **Throughput**: Target 100+ RPS sustained

### Files Generated
- HTTP test results: \`http_*_${TIMESTAMP}.txt\`
- WebSocket test results: \`websocket_*_${TIMESTAMP}.txt\` 
- Memory monitoring: \`memory_*_${TIMESTAMP}.csv\`
- Memory analysis: \`memory_*_${TIMESTAMP}.txt\`

## Next Steps

1. **Review Results**: Compare Go vs Node.js performance metrics
2. **Identify Bottlenecks**: Look for areas needing optimization
3. **Optimize Code**: Address any performance issues found
4. **Re-test**: Run benchmarks after optimizations
5. **Monitor Production**: Set up continuous monitoring

---
*Generated by TunnelForge Benchmark Suite*
EOF

    log_success "Benchmark report generated: $REPORT_FILE"
}

main() {
    echo "🚀 TunnelForge Performance Benchmark Suite"
    echo "========================================="
    echo ""
    
    check_dependencies
    setup_results_directory
    compile_benchmarks
    
    echo ""
    echo "📊 Starting benchmark tests..."
    echo ""
    
    # Test Go server if available
    if check_server "$GO_SERVER_URL" "Go Server"; then
        echo ""
        log_info "Testing Go server performance..."
        
        run_http_benchmarks "$GO_SERVER_URL" "Go" &
        http_go_pid=$!
        
        run_websocket_benchmarks "$GO_SERVER_URL" "Go" &
        ws_go_pid=$!
        
        run_memory_monitoring "Go" "tunnelforge" &
        mem_go_pid=$!
        
        # Wait for all Go server tests
        wait $http_go_pid $ws_go_pid $mem_go_pid
        
        log_success "Go server testing completed"
    fi
    
    echo ""
    
    # Test Node.js server if available
    if check_server "$NODE_SERVER_URL" "Node.js Server"; then
        echo ""
        log_info "Testing Node.js server performance..."
        
        run_http_benchmarks "$NODE_SERVER_URL" "Node" &
        http_node_pid=$!
        
        run_websocket_benchmarks "$NODE_SERVER_URL" "Node" &
        ws_node_pid=$!
        
        run_memory_monitoring "Node" "node" &
        mem_node_pid=$!
        
        # Wait for all Node.js server tests
        wait $http_node_pid $ws_node_pid $mem_node_pid
        
        log_success "Node.js server testing completed"
    fi
    
    echo ""
    generate_report
    
    echo ""
    echo "🎉 All benchmark tests completed!"
    echo ""
    echo "📁 Results directory: $RESULTS_DIR"
    echo "📊 Summary report: $REPORT_FILE"
    echo ""
    echo "🔍 Next steps:"
    echo "   1. Review the benchmark report"
    echo "   2. Analyze performance metrics" 
    echo "   3. Identify optimization opportunities"
    echo "   4. Compare Go vs Node.js performance"
    echo ""
}

# Run main function
main "$@"
