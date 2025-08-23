#!/bin/bash

# TunnelForge Migration Validation Runner
# Comprehensive test suite for migration readiness

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
REPORT_FILE="$LOG_DIR/migration-validation-report.md"

# Test results
VALIDATION_SCORE=0
MAX_VALIDATION_SCORE=0

log() {
    echo -e "$(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $(echo -e "$1" | sed 's/\x1b\[[0-9;]*m//g')" >> "$LOG_DIR/validation.log"
}

init_logging() {
    mkdir -p "$LOG_DIR"
    > "$LOG_DIR/validation.log"
    
    log "${BLUE}🧪 TunnelForge Migration Validation${NC}"
    log "${BLUE}===================================${NC}"
}

test_go_compilation() {
    log "\n${BLUE}1. Testing Go Server Compilation${NC}"
    ((MAX_VALIDATION_SCORE++))
    
    cd "$SCRIPT_DIR/go-server"
    if go build cmd/server/main.go; then
        log "${GREEN}✅ Go server compiles successfully${NC}"
        ((VALIDATION_SCORE++))
        
        # Check if binary was created
        if [[ -f "main" ]]; then
            rm main  # Clean up
        fi
    else
        log "${RED}❌ Go server compilation failed${NC}"
    fi
    cd - >/dev/null
}

test_go_tests() {
    log "\n${BLUE}2. Running Go Test Suite${NC}"
    ((MAX_VALIDATION_SCORE++))
    
    cd "$SCRIPT_DIR/go-server"
    if go test ./... -v > "$LOG_DIR/go-tests.log" 2>&1; then
        local test_count
        test_count=$(grep -c "PASS:" "$LOG_DIR/go-tests.log" || echo "0")
        log "${GREEN}✅ Go tests passed ($test_count tests)${NC}"
        ((VALIDATION_SCORE++))
    else
        log "${RED}❌ Go tests failed - see $LOG_DIR/go-tests.log${NC}"
        # Show last few lines of test output
        tail -10 "$LOG_DIR/go-tests.log" | while read -r line; do
            log "${RED}    $line${NC}"
        done
    fi
    cd - >/dev/null
}

test_bun_setup() {
    log "\n${BLUE}3. Validating Bun Web Setup${NC}"
    ((MAX_VALIDATION_SCORE++))
    
    if command -v bun >/dev/null 2>&1; then
        log "${GREEN}✅ Bun runtime available${NC}"
        
        cd "$SCRIPT_DIR/bun-web"
        if [[ -f "package.json" ]]; then
            log "${GREEN}✅ Bun package.json found${NC}"
            
            # Install dependencies
            if bun install > "$LOG_DIR/bun-install.log" 2>&1; then
                log "${GREEN}✅ Bun dependencies installed${NC}"
                ((VALIDATION_SCORE++))
            else
                log "${RED}❌ Bun dependency installation failed${NC}"
            fi
        else
            log "${RED}❌ Bun package.json not found${NC}"
        fi
        cd - >/dev/null
    else
        log "${RED}❌ Bun runtime not available${NC}"
    fi
}

test_migration_script() {
    log "\n${BLUE}4. Running Migration Test Script${NC}"
    ((MAX_VALIDATION_SCORE++))
    
    if [[ -x "$SCRIPT_DIR/migration-test.sh" ]]; then
        if timeout 120 "$SCRIPT_DIR/migration-test.sh" > "$LOG_DIR/migration-test.log" 2>&1; then
            log "${GREEN}✅ Migration tests passed${NC}"
            ((VALIDATION_SCORE++))
            
            # Extract feature parity score
            if grep -q "Feature Parity Score:" "$LOG_DIR/migration-test.log"; then
                local parity_score
                parity_score=$(grep "Feature Parity Score:" "$LOG_DIR/migration-test.log" | head -1 | grep -o '[0-9]\+/[0-9]\+' || echo "0/0")
                log "${BLUE}📊 Feature Parity Score: $parity_score${NC}"
            fi
        else
            log "${RED}❌ Migration tests failed - see $LOG_DIR/migration-test.log${NC}"
        fi
    else
        log "${RED}❌ Migration test script not found or not executable${NC}"
    fi
}

test_frontend_integration() {
    log "\n${BLUE}5. Running Frontend Integration Tests${NC}"
    ((MAX_VALIDATION_SCORE++))
    
    if [[ -x "$SCRIPT_DIR/frontend-integration-test.js" ]]; then
        if timeout 120 node "$SCRIPT_DIR/frontend-integration-test.js" > "$LOG_DIR/frontend-test.log" 2>&1; then
            log "${GREEN}✅ Frontend integration tests passed${NC}"
            ((VALIDATION_SCORE++))
        else
            log "${RED}❌ Frontend integration tests failed - see $LOG_DIR/frontend-test.log${NC}"
        fi
    else
        log "${RED}❌ Frontend integration test script not found or not executable${NC}"
    fi
}

test_security_features() {
    log "\n${BLUE}6. Validating Security Features${NC}"
    ((MAX_VALIDATION_SCORE++))
    
    cd "$SCRIPT_DIR/go-server"
    
    # Check if security tests exist and pass
    if go test ./internal/middleware -v > "$LOG_DIR/security-tests.log" 2>&1; then
        log "${GREEN}✅ Security middleware tests passed${NC}"
        
        # Check for specific security features in the code
        local security_features=0
        
        if grep -q "CSRF" internal/middleware/*.go; then
            log "${GREEN}  ✓ CSRF protection found${NC}"
            ((security_features++))
        fi
        
        if grep -q "RateLimit" internal/middleware/*.go; then
            log "${GREEN}  ✓ Rate limiting found${NC}"
            ((security_features++))
        fi
        
        if grep -q "SecurityHeaders" internal/middleware/*.go; then
            log "${GREEN}  ✓ Security headers found${NC}"
            ((security_features++))
        fi
        
        if grep -q "ValidateOrigin" internal/websocket/*.go; then
            log "${GREEN}  ✓ Origin validation found${NC}"
            ((security_features++))
        fi
        
        if [[ $security_features -ge 3 ]]; then
            log "${GREEN}✅ Security features validation passed${NC}"
            ((VALIDATION_SCORE++))
        else
            log "${YELLOW}⚠️ Some security features missing${NC}"
        fi
    else
        log "${RED}❌ Security tests failed${NC}"
    fi
    cd - >/dev/null
}

test_performance_readiness() {
    log "\n${BLUE}7. Performance Readiness Check${NC}"
    ((MAX_VALIDATION_SCORE++))
    
    # Check if benchmark results exist
    local benchmark_dir="$SCRIPT_DIR/go-server/benchmarks/benchmark_results"
    if [[ -d "$benchmark_dir" ]] && [[ -n "$(ls -A "$benchmark_dir" 2>/dev/null)" ]]; then
        log "${GREEN}✅ Performance benchmarks available${NC}"
        
        # Look for recent benchmark results
        local recent_benchmarks
        recent_benchmarks=$(find "$benchmark_dir" -name "*.md" -mtime -7 | wc -l)
        if [[ $recent_benchmarks -gt 0 ]]; then
            log "${GREEN}  ✓ Recent benchmark results found${NC}"
            ((VALIDATION_SCORE++))
        else
            log "${YELLOW}  ⚠️ No recent benchmark results${NC}"
        fi
    else
        log "${YELLOW}⚠️ No performance benchmarks available${NC}"
    fi
}

test_documentation() {
    log "\n${BLUE}8. Documentation Completeness${NC}"
    ((MAX_VALIDATION_SCORE++))
    
    local doc_score=0
    
    # Check for essential documentation files
    if [[ -f "$SCRIPT_DIR/README.md" ]]; then
        log "${GREEN}  ✓ README.md found${NC}"
        ((doc_score++))
    fi
    
    if [[ -f "$SCRIPT_DIR/MIGRATION_CHECKLIST.md" ]]; then
        log "${GREEN}  ✓ Migration checklist found${NC}"
        ((doc_score++))
    fi
    
    if [[ -f "$SCRIPT_DIR/TODO.md" ]]; then
        log "${GREEN}  ✓ TODO.md found${NC}"
        ((doc_score++))
    fi
    
    if [[ -f "$SCRIPT_DIR/go-server/README.md" ]]; then
        log "${GREEN}  ✓ Go server README found${NC}"
        ((doc_score++))
    fi
    
    if [[ $doc_score -ge 3 ]]; then
        log "${GREEN}✅ Documentation completeness passed${NC}"
        ((VALIDATION_SCORE++))
    else
        log "${YELLOW}⚠️ Some documentation missing${NC}"
    fi
}

generate_report() {
    log "\n${PURPLE}📋 Generating Migration Validation Report${NC}"
    
    local pass_percentage=0
    if [[ $MAX_VALIDATION_SCORE -gt 0 ]]; then
        pass_percentage=$(( (VALIDATION_SCORE * 100) / MAX_VALIDATION_SCORE ))
    fi
    
    # Create detailed report
    {
        echo "# TunnelForge Migration Validation Report"
        echo ""
        echo "**Generated:** $(date)"
        echo "**Score:** $VALIDATION_SCORE / $MAX_VALIDATION_SCORE ($pass_percentage%)"
        echo ""
        
        echo "## Validation Results"
        echo ""
        
        if [[ $pass_percentage -ge 90 ]]; then
            echo "🎉 **EXCELLENT** - Ready for production migration"
        elif [[ $pass_percentage -ge 80 ]]; then
            echo "✅ **GOOD** - Minor issues to address before migration"
        elif [[ $pass_percentage -ge 70 ]]; then
            echo "⚠️ **FAIR** - Several issues need attention"
        else
            echo "❌ **POOR** - Significant work needed before migration"
        fi
        
        echo ""
        echo "## Test Categories"
        echo ""
        echo "1. Go Server Compilation"
        echo "2. Go Test Suite"
        echo "3. Bun Web Setup"
        echo "4. Migration Test Script"
        echo "5. Frontend Integration Tests"
        echo "6. Security Features"
        echo "7. Performance Readiness"
        echo "8. Documentation Completeness"
        echo ""
        
        echo "## Next Steps"
        echo ""
        if [[ $pass_percentage -ge 90 ]]; then
            echo "- Run final manual testing scenarios"
            echo "- Execute migration checklist"
            echo "- Schedule migration window"
        elif [[ $pass_percentage -ge 70 ]]; then
            echo "- Address failing validation items"
            echo "- Re-run validation suite"
            echo "- Complete remaining documentation"
        else
            echo "- Fix critical compilation/test issues"
            echo "- Ensure all security features are working"
            echo "- Complete basic functionality testing"
        fi
        
        echo ""
        echo "## Log Files"
        echo ""
        echo "- **Main Log:** $LOG_DIR/validation.log"
        echo "- **Go Tests:** $LOG_DIR/go-tests.log"
        echo "- **Migration Tests:** $LOG_DIR/migration-test.log"
        echo "- **Frontend Tests:** $LOG_DIR/frontend-test.log"
        echo "- **Security Tests:** $LOG_DIR/security-tests.log"
        echo ""
        
        echo "---"
        echo "*TunnelForge Migration Validation - $(date)*"
        
    } > "$REPORT_FILE"
}

show_summary() {
    log "\n${PURPLE}📊 Migration Validation Summary${NC}"
    log "${BLUE}================================${NC}"
    
    local pass_percentage=0
    if [[ $MAX_VALIDATION_SCORE -gt 0 ]]; then
        pass_percentage=$(( (VALIDATION_SCORE * 100) / MAX_VALIDATION_SCORE ))
    fi
    
    log "Score: ${BLUE}$VALIDATION_SCORE / $MAX_VALIDATION_SCORE${NC} (${BLUE}$pass_percentage%${NC})"
    
    if [[ $pass_percentage -ge 90 ]]; then
        log "${GREEN}🎉 EXCELLENT - Ready for production migration!${NC}"
        log "${GREEN}The Go server has excellent feature parity and is ready for migration.${NC}"
    elif [[ $pass_percentage -ge 80 ]]; then
        log "${YELLOW}✅ GOOD - Minor issues to address before migration${NC}"
        log "${YELLOW}Address remaining issues then proceed with migration planning.${NC}"
    elif [[ $pass_percentage -ge 70 ]]; then
        log "${YELLOW}⚠️ FAIR - Several issues need attention${NC}"
        log "${YELLOW}Complete outstanding work before considering migration.${NC}"
    else
        log "${RED}❌ POOR - Significant work needed before migration${NC}"
        log "${RED}Focus on fixing critical issues before proceeding.${NC}"
    fi
    
    log "\n${BLUE}📋 Report saved to: $REPORT_FILE${NC}"
    log "${BLUE}📝 Logs saved to: $LOG_DIR/${NC}"
    
    # Show next steps
    log "\n${BLUE}🚀 Next Steps:${NC}"
    if [[ $pass_percentage -ge 90 ]]; then
        log "1. Run manual testing scenarios from MIGRATION_CHECKLIST.md"
        log "2. Execute ${GREEN}./start-unified.sh${NC} to test full stack"
        log "3. Plan migration timeline and stakeholder approval"
    else
        log "1. Fix failing validation items"
        log "2. Re-run ${BLUE}./validate-migration.sh${NC}"
        log "3. Aim for 90%+ score before migration"
    fi
}

main() {
    init_logging
    
    # Run all validation tests
    test_go_compilation
    test_go_tests
    test_bun_setup
    test_migration_script
    test_frontend_integration
    test_security_features
    test_performance_readiness
    test_documentation
    
    # Generate reports and summary
    generate_report
    show_summary
    
    # Exit with appropriate code
    if [[ $VALIDATION_SCORE -eq $MAX_VALIDATION_SCORE ]]; then
        exit 0
    else
        exit 1
    fi
}

main "$@"