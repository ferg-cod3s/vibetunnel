"use strict";
/**
 * Activity detection system for terminal output
 *
 * Provides generic activity tracking and app-specific status parsing
 * for enhanced terminal title updates in dynamic mode.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityDetector = void 0;
exports.registerDetector = registerDetector;
exports.testClaudeStatusDetection = testClaudeStatusDetection;
const logger_js_1 = require("./logger.js");
const process_tree_js_1 = require("./process-tree.js");
const prompt_patterns_js_1 = require("./prompt-patterns.js");
const logger = (0, logger_js_1.createLogger)('activity-detector');
// Debug flag - set to true to enable verbose logging
const CLAUDE_DEBUG = process.env.VIBETUNNEL_CLAUDE_DEBUG === 'true';
// Super debug logging wrapper
function superDebug(message, ...args) {
    if (CLAUDE_DEBUG) {
        console.log(`[ActivityDetector:DEBUG] ${message}`, ...args);
    }
}
// ANSI escape code removal regex
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes need control characters
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;
/**
 * Escape special regex characters in a string
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// Pre-compiled regex for Claude status lines
// Format 1: ✻ Crafting… (205s · ↑ 6.0k tokens · <any text> to interrupt)
// Format 2: ✻ Measuring… (6s ·  100 tokens · esc to interrupt)
// Format 3: ⏺ Calculating… (0s) - simpler format without tokens/interrupt
// Format 4: ✳ Measuring… (120s · ⚒ 671 tokens · esc to interrupt) - with hammer symbol
// Note: We match ANY non-whitespace character as the indicator since Claude uses many symbols
const CLAUDE_STATUS_REGEX = /(\S)\s+([\w\s]+?)…\s*\((\d+)s(?:\s*·\s*(\S?)\s*([\d.]+)\s*k?\s*tokens\s*·\s*[^)]+to\s+interrupt)?\)/gi;
/**
 * Parse Claude-specific status from output
 */
function parseClaudeStatus(data) {
    // Strip ANSI escape codes for cleaner matching
    const cleanData = data.replace(ANSI_REGEX, '');
    // Reset regex lastIndex since we're using global flag
    CLAUDE_STATUS_REGEX.lastIndex = 0;
    // Log if we see something that looks like a Claude status
    if (cleanData.includes('interrupt') && cleanData.includes('tokens')) {
        superDebug('Potential Claude status detected');
        superDebug('Clean data sample:', cleanData.substring(0, 200).replace(/\n/g, '\\n'));
    }
    const match = CLAUDE_STATUS_REGEX.exec(cleanData);
    if (!match) {
        // Debug log to see what we're trying to match
        if (cleanData.includes('interrupt') && cleanData.includes('tokens')) {
            superDebug('Claude status line NOT matched');
            superDebug('Looking for pattern like: ✻ Crafting… (123s · ↑ 6.0k tokens · ... to interrupt)');
            superDebug('Clean data preview:', cleanData.substring(0, 150));
            // Try to find the specific line that contains the status
            const lines = cleanData.split('\n');
            const statusLine = lines.find((line) => line.includes('interrupt') && line.includes('tokens'));
            if (statusLine) {
                superDebug('Found status line:', statusLine);
                superDebug('Line length:', statusLine.length);
                // Log each character to debug special symbols
                if (CLAUDE_DEBUG) {
                    const chars = Array.from(statusLine.substring(0, 50));
                    chars.forEach((char, idx) => {
                        console.log(`  [${idx}] '${char}' = U+${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
                    });
                }
            }
        }
        return null;
    }
    const [fullMatch, indicator, action, duration, direction, tokens] = match;
    // Handle both formats - with and without token information
    const hasTokenInfo = direction !== undefined && tokens !== undefined;
    superDebug(`Claude status MATCHED!`);
    superDebug(`Action: ${action}, Duration: ${duration}s, Direction: ${direction}, Tokens: ${tokens}`);
    superDebug(`Indicator: '${indicator}'`);
    logger.debug(`Claude status MATCHED! Action: ${action}, Duration: ${duration}s, Direction: ${direction}, Tokens: ${tokens}`);
    logger.debug(`Full match: "${fullMatch}"`);
    // Filter out the status line from output (need to search in original data with ANSI codes)
    // First try to remove the exact match from the clean data position
    const matchIndex = cleanData.indexOf(fullMatch);
    let filteredData = data;
    if (matchIndex >= 0) {
        // Find corresponding position in original data
        let originalPos = 0;
        let cleanPos = 0;
        while (cleanPos < matchIndex && originalPos < data.length) {
            if (data.startsWith('\x1b[', originalPos)) {
                // Skip ANSI sequence
                // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes need control characters
                const endMatch = /^\x1b\[[0-9;]*[a-zA-Z]/.exec(data.substring(originalPos));
                if (endMatch) {
                    originalPos += endMatch[0].length;
                }
                else {
                    originalPos++;
                }
            }
            else {
                originalPos++;
                cleanPos++;
            }
        }
        // Now try to remove the status line from around this position
        const before = data.substring(0, Math.max(0, originalPos - 10));
        const after = data.substring(originalPos + fullMatch.length + 50);
        const middle = data.substring(Math.max(0, originalPos - 10), originalPos + fullMatch.length + 50);
        // Look for the status pattern in the middle section
        const statusPattern = new RegExp(`[^\n]*${escapeRegex(indicator)}[^\n]*to\\s+interrupt[^\n]*`, 'gi');
        const cleanedMiddle = middle.replace(statusPattern, '');
        filteredData = before + cleanedMiddle + after;
    }
    // Create compact display text for title bar
    let displayText;
    if (hasTokenInfo) {
        // Format tokens - the input already has 'k' suffix in the regex pattern
        // So "6.0" means 6.0k tokens, not 6.0 tokens
        const formattedTokens = `${tokens}k`;
        // Include action and stats (without indicator to avoid title jumping)
        displayText = `${action} (${duration}s, ${direction}${formattedTokens})`;
    }
    else {
        // Simple format without token info (without indicator to avoid title jumping)
        displayText = `${action} (${duration}s)`;
    }
    return {
        filteredData,
        displayText,
        raw: {
            indicator,
            action,
            duration: Number.parseInt(duration),
            progress: hasTokenInfo ? `${direction}${tokens} tokens` : undefined,
        },
    };
}
// Registry of app-specific detectors
const detectors = [
    {
        name: 'claude',
        detect: (cmd) => {
            // First check if the command directly contains 'claude'
            const cmdStr = cmd.join(' ').toLowerCase();
            if (cmdStr.includes('claude')) {
                logger.debug('Claude detected in command line');
                return true;
            }
            // If not found in command, check the process tree
            // This catches cases where Claude is run through wrappers or scripts
            if ((0, process_tree_js_1.isClaudeInProcessTree)()) {
                logger.debug('Claude detected in process tree');
                // Log the actual Claude command if available
                const claudeCmd = (0, process_tree_js_1.getClaudeCommandFromTree)();
                if (claudeCmd) {
                    logger.debug(`Claude command from tree: ${claudeCmd}`);
                }
                return true;
            }
            return false;
        },
        parseStatus: parseClaudeStatus,
    },
    // Future detectors can be added here:
    // npm, git, docker, etc.
];
/**
 * Activity detector for a terminal session
 *
 * Tracks general activity and provides app-specific status parsing
 */
class ActivityDetector {
    constructor(command, sessionId) {
        this.lastActivityTime = Date.now();
        this.currentStatus = null;
        this.detector = null;
        this.lastStatusTime = 0; // Track when we last saw a status line
        this.ACTIVITY_TIMEOUT = 5000; // 5 seconds
        this.STATUS_TIMEOUT = 10000; // 10 seconds - clear status if not seen
        this.MEANINGFUL_OUTPUT_THRESHOLD = 5; // characters
        // Track Claude status transitions for turn notifications
        this.hadClaudeStatus = false;
        // Find matching detector for this command
        this.detector = detectors.find((d) => d.detect(command)) || null;
        this.sessionId = sessionId;
        if (this.detector) {
            logger.log(`ActivityDetector: Using ${this.detector.name} detector for command: ${command.join(' ')}`);
        }
        else {
            logger.debug(`ActivityDetector: No specific detector found for command: ${command.join(' ')}`);
        }
    }
    /**
     * Check if output is just a prompt
     */
    isJustPrompt(data) {
        // Use unified prompt detector for consistency and performance
        return prompt_patterns_js_1.PromptDetector.isPromptOnly(data);
    }
    /**
     * Process terminal output and extract activity information
     */
    processOutput(data) {
        // Don't count as activity if it's just a prompt or empty output
        const trimmed = data.trim();
        const isMeaningfulOutput = trimmed.length > this.MEANINGFUL_OUTPUT_THRESHOLD && !this.isJustPrompt(trimmed);
        if (isMeaningfulOutput) {
            this.lastActivityTime = Date.now();
        }
        // Log when we process output with a detector
        if (this.detector && data.length > 10) {
            superDebug(`Processing output with ${this.detector.name} detector (${data.length} chars)`);
        }
        // Try app-specific detection first
        if (this.detector) {
            try {
                const status = this.detector.parseStatus(data);
                if (status) {
                    this.currentStatus = status;
                    this.lastStatusTime = Date.now();
                    // Always update activity time for app-specific status
                    this.lastActivityTime = Date.now();
                    // Update Claude status tracking
                    if (this.detector.name === 'claude') {
                        this.hadClaudeStatus = true;
                    }
                    return {
                        filteredData: status.filteredData,
                        activity: {
                            isActive: true,
                            lastActivityTime: this.lastActivityTime,
                            specificStatus: {
                                app: this.detector.name,
                                status: status.displayText,
                            },
                        },
                    };
                }
            }
            catch (error) {
                logger.error(`Error in ${this.detector.name} status parser:`, error);
                // Continue with unfiltered data if parsing fails
            }
        }
        // Generic activity detection - use getActivityState for consistent time-based checking
        return {
            filteredData: data,
            activity: this.getActivityState(),
        };
    }
    /**
     * Set callback for Claude turn notifications
     */
    setOnClaudeTurn(callback) {
        this.onClaudeTurnCallback = callback;
    }
    /**
     * Get current activity state (for periodic updates)
     */
    getActivityState() {
        const now = Date.now();
        const isActive = now - this.lastActivityTime < this.ACTIVITY_TIMEOUT;
        // Clear status if we haven't seen it for a while
        if (this.currentStatus && now - this.lastStatusTime > this.STATUS_TIMEOUT) {
            logger.debug('Clearing stale status - not seen for', this.STATUS_TIMEOUT, 'ms');
            this.currentStatus = null;
            // Check if this was a Claude status clearing
            if (this.hadClaudeStatus && this.detector?.name === 'claude') {
                logger.log("Claude turn detected - status cleared, it's the user's turn");
                if (this.onClaudeTurnCallback && this.sessionId) {
                    this.onClaudeTurnCallback(this.sessionId);
                }
                this.hadClaudeStatus = false;
            }
        }
        // If we have a specific status (like Claude running), always show it
        // The activity indicator in the title will show if it's active or not
        return {
            isActive,
            lastActivityTime: this.lastActivityTime,
            specificStatus: this.currentStatus && this.detector
                ? {
                    app: this.detector.name,
                    status: this.currentStatus.displayText,
                }
                : undefined,
        };
    }
    /**
     * Clear current status (e.g., when session ends)
     */
    clearStatus() {
        this.currentStatus = null;
    }
}
exports.ActivityDetector = ActivityDetector;
/**
 * Register a new app detector
 *
 * @param detector The detector to register
 */
function registerDetector(detector) {
    const existing = detectors.findIndex((d) => d.name === detector.name);
    if (existing >= 0) {
        detectors[existing] = detector;
        logger.debug(`Updated ${detector.name} detector`);
    }
    else {
        detectors.push(detector);
        logger.debug(`Registered ${detector.name} detector`);
    }
}
/**
 * Test function to help debug Claude status detection
 * @param testData Sample data to test the regex against
 */
function testClaudeStatusDetection(testData) {
    console.log('\n=== Testing Claude Status Detection ===');
    console.log('Raw data length:', testData.length);
    console.log('Raw data (first 300 chars):', testData.substring(0, 300).replace(/\n/g, '\\n'));
    // Test with current implementation
    const result = parseClaudeStatus(testData);
    if (result) {
        console.log('✅ Status detected:', result.displayText);
    }
    else {
        console.log('❌ No status detected');
        // Try different variations
        const cleanData = testData.replace(ANSI_REGEX, '');
        console.log('\nClean data (no ANSI):', cleanData.substring(0, 300).replace(/\n/g, '\\n'));
        // Test simpler patterns
        const patterns = [
            /tokens.*interrupt/gi,
            /\d+s.*tokens/gi,
            /[↑↓]\s*\d+.*tokens/gi,
            /(\w+)….*\d+s/gi,
        ];
        patterns.forEach((pattern, idx) => {
            if (pattern.test(cleanData)) {
                console.log(`✓ Pattern ${idx} matches:`, pattern.toString());
                const match = pattern.exec(cleanData);
                if (match) {
                    console.log('  Match:', match[0].substring(0, 100));
                }
            }
            else {
                console.log(`✗ Pattern ${idx} no match:`, pattern.toString());
            }
            pattern.lastIndex = 0; // Reset
        });
    }
    console.log('=== End Test ===\n');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWN0aXZpdHktZGV0ZWN0b3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3V0aWxzL2FjdGl2aXR5LWRldGVjdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7R0FLRzs7O0FBNllILDRDQVNDO0FBTUQsOERBc0NDO0FBaGNELDJDQUEyQztBQUMzQyx1REFBb0Y7QUFDcEYsNkRBQXNEO0FBRXRELE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxtQkFBbUIsQ0FBQyxDQUFDO0FBRWpELHFEQUFxRDtBQUNyRCxNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QixLQUFLLE1BQU0sQ0FBQztBQUVwRSw4QkFBOEI7QUFDOUIsU0FBUyxVQUFVLENBQUMsT0FBZSxFQUFFLEdBQUcsSUFBZTtJQUNyRCxJQUFJLFlBQVksRUFBRSxDQUFDO1FBQ2pCLE9BQU8sQ0FBQyxHQUFHLENBQUMsNEJBQTRCLE9BQU8sRUFBRSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7SUFDOUQsQ0FBQztBQUNILENBQUM7QUFFRCxpQ0FBaUM7QUFDakMscUdBQXFHO0FBQ3JHLE1BQU0sVUFBVSxHQUFHLHdCQUF3QixDQUFDO0FBRTVDOztHQUVHO0FBQ0gsU0FBUyxXQUFXLENBQUMsR0FBVztJQUM5QixPQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUMscUJBQXFCLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDcEQsQ0FBQztBQThDRCw2Q0FBNkM7QUFDN0MseUVBQXlFO0FBQ3pFLCtEQUErRDtBQUMvRCwwRUFBMEU7QUFDMUUsdUZBQXVGO0FBQ3ZGLDhGQUE4RjtBQUM5RixNQUFNLG1CQUFtQixHQUN2Qix1R0FBdUcsQ0FBQztBQUUxRzs7R0FFRztBQUNILFNBQVMsaUJBQWlCLENBQUMsSUFBWTtJQUNyQywrQ0FBK0M7SUFDL0MsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVB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SUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7Z0JBQzVCLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxHQUFHLFdBQVcsRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztnQkFDN0QsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDdEMsSUFBSSxLQUFLLEVBQUUsQ0FBQztvQkFDVixPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUN0RCxDQUFDO1lBQ0gsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxHQUFHLFlBQVksRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUNoRSxDQUFDO1lBQ0QsT0FBTyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQyxRQUFRO1FBQ2pDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUNELE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUNwQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBBY3Rpdml0eSBkZXRlY3Rpb24gc3lzdGVtIGZvciB0ZXJtaW5hbCBvdXRwdXRcbiAqXG4gKiBQcm92aWRlcyBnZW5lcmljIGFjdGl2aXR5IHRyYWNraW5nIGFuZCBhcHAtc3BlY2lmaWMgc3RhdHVzIHBhcnNpbmdcbiAqIGZvciBlbmhhbmNlZCB0ZXJtaW5hbCB0aXRsZSB1cGRhdGVzIGluIGR5bmFtaWMgbW9kZS5cbiAqL1xuXG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuL2xvZ2dlci5qcyc7XG5pbXBvcnQgeyBnZXRDbGF1ZGVDb21tYW5kRnJvbVRyZWUsIGlzQ2xhdWRlSW5Qcm9jZXNzVHJlZSB9IGZyb20gJy4vcHJvY2Vzcy10cmVlLmpzJztcbmltcG9ydCB7IFByb21wdERldGVjdG9yIH0gZnJvbSAnLi9wcm9tcHQtcGF0dGVybnMuanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ2FjdGl2aXR5LWRldGVjdG9yJyk7XG5cbi8vIERlYnVnIGZsYWcgLSBzZXQgdG8gdHJ1ZSB0byBlbmFibGUgdmVyYm9zZSBsb2dnaW5nXG5jb25zdCBDTEFVREVfREVCVUcgPSBwcm9jZXNzLmVudi5WSUJFVFVOTkVMX0NMQVVERV9ERUJVRyA9PT0gJ3RydWUnO1xuXG4vLyBTdXBlciBkZWJ1ZyBsb2dnaW5nIHdyYXBwZXJcbmZ1bmN0aW9uIHN1cGVyRGVidWcobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcbiAgaWYgKENMQVVERV9ERUJVRykge1xuICAgIGNvbnNvbGUubG9nKGBbQWN0aXZpdHlEZXRlY3RvcjpERUJVR10gJHttZXNzYWdlfWAsIC4uLmFyZ3MpO1xuICB9XG59XG5cbi8vIEFOU0kgZXNjYXBlIGNvZGUgcmVtb3ZhbCByZWdleFxuLy8gYmlvbWUtaWdub3JlIGxpbnQvc3VzcGljaW91cy9ub0NvbnRyb2xDaGFyYWN0ZXJzSW5SZWdleDogQU5TSSBlc2NhcGUgY29kZXMgbmVlZCBjb250cm9sIGNoYXJhY3RlcnNcbmNvbnN0IEFOU0lfUkVHRVggPSAvXFx4MWJcXFtbMC05O10qW2EtekEtWl0vZztcblxuLyoqXG4gKiBFc2NhcGUgc3BlY2lhbCByZWdleCBjaGFyYWN0ZXJzIGluIGEgc3RyaW5nXG4gKi9cbmZ1bmN0aW9uIGVzY2FwZVJlZ2V4KHN0cjogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgJ1xcXFwkJicpO1xufVxuXG4vKipcbiAqIEFjdGl2aXR5IHN0YXR1cyByZXR1cm5lZCBieSBhcHAtc3BlY2lmaWMgcGFyc2Vyc1xuICovXG5leHBvcnQgaW50ZXJmYWNlIEFjdGl2aXR5U3RhdHVzIHtcbiAgLyoqIFRoZSBvdXRwdXQgZGF0YSB3aXRoIHN0YXR1cyBsaW5lcyBmaWx0ZXJlZCBvdXQgKi9cbiAgZmlsdGVyZWREYXRhOiBzdHJpbmc7XG4gIC8qKiBIdW1hbi1yZWFkYWJsZSBzdGF0dXMgdGV4dCBmb3IgZGlzcGxheSBpbiB0aXRsZSAqL1xuICBkaXNwbGF5VGV4dDogc3RyaW5nO1xuICAvKiogUmF3IHN0YXR1cyBkYXRhIGZvciBwb3RlbnRpYWwgZnV0dXJlIHVzZSAqL1xuICByYXc/OiB7XG4gICAgaW5kaWNhdG9yPzogc3RyaW5nO1xuICAgIGFjdGlvbj86IHN0cmluZztcbiAgICBkdXJhdGlvbj86IG51bWJlcjtcbiAgICBwcm9ncmVzcz86IHN0cmluZztcbiAgfTtcbn1cblxuLyoqXG4gKiBDdXJyZW50IGFjdGl2aXR5IHN0YXRlIGZvciBhIHRlcm1pbmFsIHNlc3Npb25cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBBY3Rpdml0eVN0YXRlIHtcbiAgLyoqIFdoZXRoZXIgdGhlIHRlcm1pbmFsIGlzIGN1cnJlbnRseSBhY3RpdmUgKi9cbiAgaXNBY3RpdmU6IGJvb2xlYW47XG4gIC8qKiBUaW1lc3RhbXAgb2YgbGFzdCBhY3Rpdml0eSAqL1xuICBsYXN0QWN0aXZpdHlUaW1lOiBudW1iZXI7XG4gIC8qKiBBcHAtc3BlY2lmaWMgc3RhdHVzIGlmIGRldGVjdGVkICovXG4gIHNwZWNpZmljU3RhdHVzPzoge1xuICAgIGFwcDogc3RyaW5nO1xuICAgIHN0YXR1czogc3RyaW5nO1xuICB9O1xufVxuXG4vKipcbiAqIEFwcC1zcGVjaWZpYyBkZXRlY3RvciBpbnRlcmZhY2VcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBBcHBEZXRlY3RvciB7XG4gIC8qKiBOYW1lIG9mIHRoZSBhcHAgdGhpcyBkZXRlY3RvciBoYW5kbGVzICovXG4gIG5hbWU6IHN0cmluZztcbiAgLyoqIENoZWNrIGlmIHRoaXMgZGV0ZWN0b3Igc2hvdWxkIGJlIHVzZWQgZm9yIHRoZSBnaXZlbiBjb21tYW5kICovXG4gIGRldGVjdDogKGNvbW1hbmQ6IHN0cmluZ1tdKSA9PiBib29sZWFuO1xuICAvKiogUGFyc2UgYXBwLXNwZWNpZmljIHN0YXR1cyBmcm9tIG91dHB1dCBkYXRhICovXG4gIHBhcnNlU3RhdHVzOiAoZGF0YTogc3RyaW5nKSA9PiBBY3Rpdml0eVN0YXR1cyB8IG51bGw7XG59XG5cbi8vIFByZS1jb21waWxlZCByZWdleCBmb3IgQ2xhdWRlIHN0YXR1cyBsaW5lc1xuLy8gRm9ybWF0IDE6IOKcuyBDcmFmdGluZ+KApiAoMjA1cyDCtyDihpEgNi4wayB0b2tlbnMgwrcgPGFueSB0ZXh0PiB0byBpbnRlcnJ1cHQpXG4vLyBGb3JtYXQgMjog4py7IE1lYXN1cmluZ+KApiAoNnMgwrcgIDEwMCB0b2tlbnMgwrcgZXNjIHRvIGludGVycnVwdClcbi8vIEZvcm1hdCAzOiDij7ogQ2FsY3VsYXRpbmfigKYgKDBzKSAtIHNpbXBsZXIgZm9ybWF0IHdpdGhvdXQgdG9rZW5zL2ludGVycnVwdFxuLy8gRm9ybWF0IDQ6IOKcsyBNZWFzdXJpbmfigKYgKDEyMHMgwrcg4pqSIDY3MSB0b2tlbnMgwrcgZXNjIHRvIGludGVycnVwdCkgLSB3aXRoIGhhbW1lciBzeW1ib2xcbi8vIE5vdGU6IFdlIG1hdGNoIEFOWSBub24td2hpdGVzcGFjZSBjaGFyYWN0ZXIgYXMgdGhlIGluZGljYXRvciBzaW5jZSBDbGF1ZGUgdXNlcyBtYW55IHN5bWJvbHNcbmNvbnN0IENMQVVERV9TVEFUVVNfUkVHRVggPVxuICAvKFxcUylcXHMrKFtcXHdcXHNdKz8p4oCmXFxzKlxcKChcXGQrKXMoPzpcXHMqwrdcXHMqKFxcUz8pXFxzKihbXFxkLl0rKVxccyprP1xccyp0b2tlbnNcXHMqwrdcXHMqW14pXSt0b1xccytpbnRlcnJ1cHQpP1xcKS9naTtcblxuLyoqXG4gKiBQYXJzZSBDbGF1ZGUtc3BlY2lmaWMgc3RhdHVzIGZyb20gb3V0cHV0XG4gKi9cbmZ1bmN0aW9uIHBhcnNlQ2xhdWRlU3RhdHVzKGRhdGE6IHN0cmluZyk6IEFjdGl2aXR5U3RhdHVzIHwgbnVsbCB7XG4gIC8vIFN0cmlwIEFOU0kgZXNjYXBlIGNvZGVzIGZvciBjbGVhbmVyIG1hdGNoaW5nXG4gIGNvbnN0IGNsZWFuRGF0YSA9IGRhdGEucmVwbGFjZShBTlNJX1JFR0VYLCAnJyk7XG5cbiAgLy8gUmVzZXQgcmVnZXggbGFzdEluZGV4IHNpbmNlIHdlJ3JlIHVzaW5nIGdsb2JhbCBmbGFnXG4gIENMQVVERV9TVEFUVVNfUkVHRVgubGFzdEluZGV4ID0gMDtcblxuICAvLyBMb2cgaWYgd2Ugc2VlIHNvbWV0aGluZyB0aGF0IGxvb2tzIGxpa2UgYSBDbGF1ZGUgc3RhdHVzXG4gIGlmIChjbGVhbkRhdGEuaW5jbHVkZXMoJ2ludGVycnVwdCcpICYmIGNsZWFuRGF0YS5pbmNsdWRlcygndG9rZW5zJykpIHtcbiAgICBzdXBlckRlYnVnKCdQb3RlbnRpYWwgQ2xhdWRlIHN0YXR1cyBkZXRlY3RlZCcpO1xuICAgIHN1cGVyRGVidWcoJ0NsZWFuIGRhdGEgc2FtcGxlOicsIGNsZWFuRGF0YS5zdWJzdHJpbmcoMCwgMjAwKS5yZXBsYWNlKC9cXG4vZywgJ1xcXFxuJykpO1xuICB9XG5cbiAgY29uc3QgbWF0Y2ggPSBDTEFVREVfU1RBVFVTX1JFR0VYLmV4ZWMoY2xlYW5EYXRhKTtcbiAgaWYgKCFtYXRjaCkge1xuICAgIC8vIERlYnVnIGxvZyB0byBzZWUgd2hhdCB3ZSdyZSB0cnlpbmcgdG8gbWF0Y2hcbiAgICBpZiAoY2xlYW5EYXRhLmluY2x1ZGVzKCdpbnRlcnJ1cHQnKSAmJiBjbGVhbkRhdGEuaW5jbHVkZXMoJ3Rva2VucycpKSB7XG4gICAgICBzdXBlckRlYnVnKCdDbGF1ZGUgc3RhdHVzIGxpbmUgTk9UIG1hdGNoZWQnKTtcbiAgICAgIHN1cGVyRGVidWcoJ0xvb2tpbmcgZm9yIHBhdHRlcm4gbGlrZTog4py7IENyYWZ0aW5n4oCmICgxMjNzIMK3IOKGkSA2LjBrIHRva2VucyDCtyAuLi4gdG8gaW50ZXJydXB0KScpO1xuICAgICAgc3VwZXJEZWJ1ZygnQ2xlYW4gZGF0YSBwcmV2aWV3OicsIGNsZWFuRGF0YS5zdWJzdHJpbmcoMCwgMTUwKSk7XG5cbiAgICAgIC8vIFRyeSB0byBmaW5kIHRoZSBzcGVjaWZpYyBsaW5lIHRoYXQgY29udGFpbnMgdGhlIHN0YXR1c1xuICAgICAgY29uc3QgbGluZXMgPSBjbGVhbkRhdGEuc3BsaXQoJ1xcbicpO1xuICAgICAgY29uc3Qgc3RhdHVzTGluZSA9IGxpbmVzLmZpbmQoXG4gICAgICAgIChsaW5lKSA9PiBsaW5lLmluY2x1ZGVzKCdpbnRlcnJ1cHQnKSAmJiBsaW5lLmluY2x1ZGVzKCd0b2tlbnMnKVxuICAgICAgKTtcbiAgICAgIGlmIChzdGF0dXNMaW5lKSB7XG4gICAgICAgIHN1cGVyRGVidWcoJ0ZvdW5kIHN0YXR1cyBsaW5lOicsIHN0YXR1c0xpbmUpO1xuICAgICAgICBzdXBlckRlYnVnKCdMaW5lIGxlbmd0aDonLCBzdGF0dXNMaW5lLmxlbmd0aCk7XG4gICAgICAgIC8vIExvZyBlYWNoIGNoYXJhY3RlciB0byBkZWJ1ZyBzcGVjaWFsIHN5bWJvbHNcbiAgICAgICAgaWYgKENMQVVERV9ERUJVRykge1xuICAgICAgICAgIGNvbnN0IGNoYXJzID0gQXJyYXkuZnJvbShzdGF0dXNMaW5lLnN1YnN0cmluZygwLCA1MCkpO1xuICAgICAgICAgIGNoYXJzLmZvckVhY2goKGNoYXIsIGlkeCkgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICAgIGAgIFske2lkeH1dICcke2NoYXJ9JyA9IFUrJHtjaGFyLmNoYXJDb2RlQXQoMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDQsICcwJyl9YFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IFtmdWxsTWF0Y2gsIGluZGljYXRvciwgYWN0aW9uLCBkdXJhdGlvbiwgZGlyZWN0aW9uLCB0b2tlbnNdID0gbWF0Y2g7XG5cbiAgLy8gSGFuZGxlIGJvdGggZm9ybWF0cyAtIHdpdGggYW5kIHdpdGhvdXQgdG9rZW4gaW5mb3JtYXRpb25cbiAgY29uc3QgaGFzVG9rZW5JbmZvID0gZGlyZWN0aW9uICE9PSB1bmRlZmluZWQgJiYgdG9rZW5zICE9PSB1bmRlZmluZWQ7XG5cbiAgc3VwZXJEZWJ1ZyhgQ2xhdWRlIHN0YXR1cyBNQVRDSEVEIWApO1xuICBzdXBlckRlYnVnKFxuICAgIGBBY3Rpb246ICR7YWN0aW9ufSwgRHVyYXRpb246ICR7ZHVyYXRpb259cywgRGlyZWN0aW9uOiAke2RpcmVjdGlvbn0sIFRva2VuczogJHt0b2tlbnN9YFxuICApO1xuICBzdXBlckRlYnVnKGBJbmRpY2F0b3I6ICcke2luZGljYXRvcn0nYCk7XG4gIGxvZ2dlci5kZWJ1ZyhcbiAgICBgQ2xhdWRlIHN0YXR1cyBNQVRDSEVEISBBY3Rpb246ICR7YWN0aW9ufSwgRHVyYXRpb246ICR7ZHVyYXRpb259cywgRGlyZWN0aW9uOiAke2RpcmVjdGlvbn0sIFRva2VuczogJHt0b2tlbnN9YFxuICApO1xuICBsb2dnZXIuZGVidWcoYEZ1bGwgbWF0Y2g6IFwiJHtmdWxsTWF0Y2h9XCJgKTtcblxuICAvLyBGaWx0ZXIgb3V0IHRoZSBzdGF0dXMgbGluZSBmcm9tIG91dHB1dCAobmVlZCB0byBzZWFyY2ggaW4gb3JpZ2luYWwgZGF0YSB3aXRoIEFOU0kgY29kZXMpXG4gIC8vIEZpcnN0IHRyeSB0byByZW1vdmUgdGhlIGV4YWN0IG1hdGNoIGZyb20gdGhlIGNsZWFuIGRhdGEgcG9zaXRpb25cbiAgY29uc3QgbWF0Y2hJbmRleCA9IGNsZWFuRGF0YS5pbmRleE9mKGZ1bGxNYXRjaCk7XG4gIGxldCBmaWx0ZXJlZERhdGEgPSBkYXRhO1xuICBpZiAobWF0Y2hJbmRleCA+PSAwKSB7XG4gICAgLy8gRmluZCBjb3JyZXNwb25kaW5nIHBvc2l0aW9uIGluIG9yaWdpbmFsIGRhdGFcbiAgICBsZXQgb3JpZ2luYWxQb3MgPSAwO1xuICAgIGxldCBjbGVhblBvcyA9IDA7XG4gICAgd2hpbGUgKGNsZWFuUG9zIDwgbWF0Y2hJbmRleCAmJiBvcmlnaW5hbFBvcyA8IGRhdGEubGVuZ3RoKSB7XG4gICAgICBpZiAoZGF0YS5zdGFydHNXaXRoKCdcXHgxYlsnLCBvcmlnaW5hbFBvcykpIHtcbiAgICAgICAgLy8gU2tpcCBBTlNJIHNlcXVlbmNlXG4gICAgICAgIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Db250cm9sQ2hhcmFjdGVyc0luUmVnZXg6IEFOU0kgZXNjYXBlIGNvZGVzIG5lZWQgY29udHJvbCBjaGFyYWN0ZXJzXG4gICAgICAgIGNvbnN0IGVuZE1hdGNoID0gL15cXHgxYlxcW1swLTk7XSpbYS16QS1aXS8uZXhlYyhkYXRhLnN1YnN0cmluZyhvcmlnaW5hbFBvcykpO1xuICAgICAgICBpZiAoZW5kTWF0Y2gpIHtcbiAgICAgICAgICBvcmlnaW5hbFBvcyArPSBlbmRNYXRjaFswXS5sZW5ndGg7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgb3JpZ2luYWxQb3MrKztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3JpZ2luYWxQb3MrKztcbiAgICAgICAgY2xlYW5Qb3MrKztcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gTm93IHRyeSB0byByZW1vdmUgdGhlIHN0YXR1cyBsaW5lIGZyb20gYXJvdW5kIHRoaXMgcG9zaXRpb25cbiAgICBjb25zdCBiZWZvcmUgPSBkYXRhLnN1YnN0cmluZygwLCBNYXRoLm1heCgwLCBvcmlnaW5hbFBvcyAtIDEwKSk7XG4gICAgY29uc3QgYWZ0ZXIgPSBkYXRhLnN1YnN0cmluZyhvcmlnaW5hbFBvcyArIGZ1bGxNYXRjaC5sZW5ndGggKyA1MCk7XG4gICAgY29uc3QgbWlkZGxlID0gZGF0YS5zdWJzdHJpbmcoXG4gICAgICBNYXRoLm1heCgwLCBvcmlnaW5hbFBvcyAtIDEwKSxcbiAgICAgIG9yaWdpbmFsUG9zICsgZnVsbE1hdGNoLmxlbmd0aCArIDUwXG4gICAgKTtcbiAgICAvLyBMb29rIGZvciB0aGUgc3RhdHVzIHBhdHRlcm4gaW4gdGhlIG1pZGRsZSBzZWN0aW9uXG4gICAgY29uc3Qgc3RhdHVzUGF0dGVybiA9IG5ldyBSZWdFeHAoXG4gICAgICBgW15cXG5dKiR7ZXNjYXBlUmVnZXgoaW5kaWNhdG9yKX1bXlxcbl0qdG9cXFxccytpbnRlcnJ1cHRbXlxcbl0qYCxcbiAgICAgICdnaSdcbiAgICApO1xuICAgIGNvbnN0IGNsZWFuZWRNaWRkbGUgPSBtaWRkbGUucmVwbGFjZShzdGF0dXNQYXR0ZXJuLCAnJyk7XG4gICAgZmlsdGVyZWREYXRhID0gYmVmb3JlICsgY2xlYW5lZE1pZGRsZSArIGFmdGVyO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGNvbXBhY3QgZGlzcGxheSB0ZXh0IGZvciB0aXRsZSBiYXJcbiAgbGV0IGRpc3BsYXlUZXh0OiBzdHJpbmc7XG4gIGlmIChoYXNUb2tlbkluZm8pIHtcbiAgICAvLyBGb3JtYXQgdG9rZW5zIC0gdGhlIGlucHV0IGFscmVhZHkgaGFzICdrJyBzdWZmaXggaW4gdGhlIHJlZ2V4IHBhdHRlcm5cbiAgICAvLyBTbyBcIjYuMFwiIG1lYW5zIDYuMGsgdG9rZW5zLCBub3QgNi4wIHRva2Vuc1xuICAgIGNvbnN0IGZvcm1hdHRlZFRva2VucyA9IGAke3Rva2Vuc31rYDtcbiAgICAvLyBJbmNsdWRlIGFjdGlvbiBhbmQgc3RhdHMgKHdpdGhvdXQgaW5kaWNhdG9yIHRvIGF2b2lkIHRpdGxlIGp1bXBpbmcpXG4gICAgZGlzcGxheVRleHQgPSBgJHthY3Rpb259ICgke2R1cmF0aW9ufXMsICR7ZGlyZWN0aW9ufSR7Zm9ybWF0dGVkVG9rZW5zfSlgO1xuICB9IGVsc2Uge1xuICAgIC8vIFNpbXBsZSBmb3JtYXQgd2l0aG91dCB0b2tlbiBpbmZvICh3aXRob3V0IGluZGljYXRvciB0byBhdm9pZCB0aXRsZSBqdW1waW5nKVxuICAgIGRpc3BsYXlUZXh0ID0gYCR7YWN0aW9ufSAoJHtkdXJhdGlvbn1zKWA7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGZpbHRlcmVkRGF0YSxcbiAgICBkaXNwbGF5VGV4dCxcbiAgICByYXc6IHtcbiAgICAgIGluZGljYXRvcixcbiAgICAgIGFjdGlvbixcbiAgICAgIGR1cmF0aW9uOiBOdW1iZXIucGFyc2VJbnQoZHVyYXRpb24pLFxuICAgICAgcHJvZ3Jlc3M6IGhhc1Rva2VuSW5mbyA/IGAke2RpcmVjdGlvbn0ke3Rva2Vuc30gdG9rZW5zYCA6IHVuZGVmaW5lZCxcbiAgICB9LFxuICB9O1xufVxuXG4vLyBSZWdpc3RyeSBvZiBhcHAtc3BlY2lmaWMgZGV0ZWN0b3JzXG5jb25zdCBkZXRlY3RvcnM6IEFwcERldGVjdG9yW10gPSBbXG4gIHtcbiAgICBuYW1lOiAnY2xhdWRlJyxcbiAgICBkZXRlY3Q6IChjbWQpID0+IHtcbiAgICAgIC8vIEZpcnN0IGNoZWNrIGlmIHRoZSBjb21tYW5kIGRpcmVjdGx5IGNvbnRhaW5zICdjbGF1ZGUnXG4gICAgICBjb25zdCBjbWRTdHIgPSBjbWQuam9pbignICcpLnRvTG93ZXJDYXNlKCk7XG4gICAgICBpZiAoY21kU3RyLmluY2x1ZGVzKCdjbGF1ZGUnKSkge1xuICAgICAgICBsb2dnZXIuZGVidWcoJ0NsYXVkZSBkZXRlY3RlZCBpbiBjb21tYW5kIGxpbmUnKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIC8vIElmIG5vdCBmb3VuZCBpbiBjb21tYW5kLCBjaGVjayB0aGUgcHJvY2VzcyB0cmVlXG4gICAgICAvLyBUaGlzIGNhdGNoZXMgY2FzZXMgd2hlcmUgQ2xhdWRlIGlzIHJ1biB0aHJvdWdoIHdyYXBwZXJzIG9yIHNjcmlwdHNcbiAgICAgIGlmIChpc0NsYXVkZUluUHJvY2Vzc1RyZWUoKSkge1xuICAgICAgICBsb2dnZXIuZGVidWcoJ0NsYXVkZSBkZXRlY3RlZCBpbiBwcm9jZXNzIHRyZWUnKTtcbiAgICAgICAgLy8gTG9nIHRoZSBhY3R1YWwgQ2xhdWRlIGNvbW1hbmQgaWYgYXZhaWxhYmxlXG4gICAgICAgIGNvbnN0IGNsYXVkZUNtZCA9IGdldENsYXVkZUNvbW1hbmRGcm9tVHJlZSgpO1xuICAgICAgICBpZiAoY2xhdWRlQ21kKSB7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKGBDbGF1ZGUgY29tbWFuZCBmcm9tIHRyZWU6ICR7Y2xhdWRlQ21kfWApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSxcbiAgICBwYXJzZVN0YXR1czogcGFyc2VDbGF1ZGVTdGF0dXMsXG4gIH0sXG4gIC8vIEZ1dHVyZSBkZXRlY3RvcnMgY2FuIGJlIGFkZGVkIGhlcmU6XG4gIC8vIG5wbSwgZ2l0LCBkb2NrZXIsIGV0Yy5cbl07XG5cbi8qKlxuICogQWN0aXZpdHkgZGV0ZWN0b3IgZm9yIGEgdGVybWluYWwgc2Vzc2lvblxuICpcbiAqIFRyYWNrcyBnZW5lcmFsIGFjdGl2aXR5IGFuZCBwcm92aWRlcyBhcHAtc3BlY2lmaWMgc3RhdHVzIHBhcnNpbmdcbiAqL1xuZXhwb3J0IGNsYXNzIEFjdGl2aXR5RGV0ZWN0b3Ige1xuICBwcml2YXRlIGxhc3RBY3Rpdml0eVRpbWUgPSBEYXRlLm5vdygpO1xuICBwcml2YXRlIGN1cnJlbnRTdGF0dXM6IEFjdGl2aXR5U3RhdHVzIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgZGV0ZWN0b3I6IEFwcERldGVjdG9yIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgbGFzdFN0YXR1c1RpbWUgPSAwOyAvLyBUcmFjayB3aGVuIHdlIGxhc3Qgc2F3IGEgc3RhdHVzIGxpbmVcbiAgcHJpdmF0ZSByZWFkb25seSBBQ1RJVklUWV9USU1FT1VUID0gNTAwMDsgLy8gNSBzZWNvbmRzXG4gIHByaXZhdGUgcmVhZG9ubHkgU1RBVFVTX1RJTUVPVVQgPSAxMDAwMDsgLy8gMTAgc2Vjb25kcyAtIGNsZWFyIHN0YXR1cyBpZiBub3Qgc2VlblxuICBwcml2YXRlIHJlYWRvbmx5IE1FQU5JTkdGVUxfT1VUUFVUX1RIUkVTSE9MRCA9IDU7IC8vIGNoYXJhY3RlcnNcblxuICAvLyBUcmFjayBDbGF1ZGUgc3RhdHVzIHRyYW5zaXRpb25zIGZvciB0dXJuIG5vdGlmaWNhdGlvbnNcbiAgcHJpdmF0ZSBoYWRDbGF1ZGVTdGF0dXMgPSBmYWxzZTtcbiAgcHJpdmF0ZSBvbkNsYXVkZVR1cm5DYWxsYmFjaz86IChzZXNzaW9uSWQ6IHN0cmluZykgPT4gdm9pZDtcbiAgcHJpdmF0ZSBzZXNzaW9uSWQ/OiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3IoY29tbWFuZDogc3RyaW5nW10sIHNlc3Npb25JZD86IHN0cmluZykge1xuICAgIC8vIEZpbmQgbWF0Y2hpbmcgZGV0ZWN0b3IgZm9yIHRoaXMgY29tbWFuZFxuICAgIHRoaXMuZGV0ZWN0b3IgPSBkZXRlY3RvcnMuZmluZCgoZCkgPT4gZC5kZXRlY3QoY29tbWFuZCkpIHx8IG51bGw7XG4gICAgdGhpcy5zZXNzaW9uSWQgPSBzZXNzaW9uSWQ7XG5cbiAgICBpZiAodGhpcy5kZXRlY3Rvcikge1xuICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgYEFjdGl2aXR5RGV0ZWN0b3I6IFVzaW5nICR7dGhpcy5kZXRlY3Rvci5uYW1lfSBkZXRlY3RvciBmb3IgY29tbWFuZDogJHtjb21tYW5kLmpvaW4oJyAnKX1gXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgIGBBY3Rpdml0eURldGVjdG9yOiBObyBzcGVjaWZpYyBkZXRlY3RvciBmb3VuZCBmb3IgY29tbWFuZDogJHtjb21tYW5kLmpvaW4oJyAnKX1gXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiBvdXRwdXQgaXMganVzdCBhIHByb21wdFxuICAgKi9cbiAgcHJpdmF0ZSBpc0p1c3RQcm9tcHQoZGF0YTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgLy8gVXNlIHVuaWZpZWQgcHJvbXB0IGRldGVjdG9yIGZvciBjb25zaXN0ZW5jeSBhbmQgcGVyZm9ybWFuY2VcbiAgICByZXR1cm4gUHJvbXB0RGV0ZWN0b3IuaXNQcm9tcHRPbmx5KGRhdGEpO1xuICB9XG5cbiAgLyoqXG4gICAqIFByb2Nlc3MgdGVybWluYWwgb3V0cHV0IGFuZCBleHRyYWN0IGFjdGl2aXR5IGluZm9ybWF0aW9uXG4gICAqL1xuICBwcm9jZXNzT3V0cHV0KGRhdGE6IHN0cmluZyk6IHsgZmlsdGVyZWREYXRhOiBzdHJpbmc7IGFjdGl2aXR5OiBBY3Rpdml0eVN0YXRlIH0ge1xuICAgIC8vIERvbid0IGNvdW50IGFzIGFjdGl2aXR5IGlmIGl0J3MganVzdCBhIHByb21wdCBvciBlbXB0eSBvdXRwdXRcbiAgICBjb25zdCB0cmltbWVkID0gZGF0YS50cmltKCk7XG4gICAgY29uc3QgaXNNZWFuaW5nZnVsT3V0cHV0ID1cbiAgICAgIHRyaW1tZWQubGVuZ3RoID4gdGhpcy5NRUFOSU5HRlVMX09VVFBVVF9USFJFU0hPTEQgJiYgIXRoaXMuaXNKdXN0UHJvbXB0KHRyaW1tZWQpO1xuXG4gICAgaWYgKGlzTWVhbmluZ2Z1bE91dHB1dCkge1xuICAgICAgdGhpcy5sYXN0QWN0aXZpdHlUaW1lID0gRGF0ZS5ub3coKTtcbiAgICB9XG5cbiAgICAvLyBMb2cgd2hlbiB3ZSBwcm9jZXNzIG91dHB1dCB3aXRoIGEgZGV0ZWN0b3JcbiAgICBpZiAodGhpcy5kZXRlY3RvciAmJiBkYXRhLmxlbmd0aCA+IDEwKSB7XG4gICAgICBzdXBlckRlYnVnKGBQcm9jZXNzaW5nIG91dHB1dCB3aXRoICR7dGhpcy5kZXRlY3Rvci5uYW1lfSBkZXRlY3RvciAoJHtkYXRhLmxlbmd0aH0gY2hhcnMpYCk7XG4gICAgfVxuXG4gICAgLy8gVHJ5IGFwcC1zcGVjaWZpYyBkZXRlY3Rpb24gZmlyc3RcbiAgICBpZiAodGhpcy5kZXRlY3Rvcikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc3RhdHVzID0gdGhpcy5kZXRlY3Rvci5wYXJzZVN0YXR1cyhkYXRhKTtcbiAgICAgICAgaWYgKHN0YXR1cykge1xuICAgICAgICAgIHRoaXMuY3VycmVudFN0YXR1cyA9IHN0YXR1cztcbiAgICAgICAgICB0aGlzLmxhc3RTdGF0dXNUaW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgICAvLyBBbHdheXMgdXBkYXRlIGFjdGl2aXR5IHRpbWUgZm9yIGFwcC1zcGVjaWZpYyBzdGF0dXNcbiAgICAgICAgICB0aGlzLmxhc3RBY3Rpdml0eVRpbWUgPSBEYXRlLm5vdygpO1xuXG4gICAgICAgICAgLy8gVXBkYXRlIENsYXVkZSBzdGF0dXMgdHJhY2tpbmdcbiAgICAgICAgICBpZiAodGhpcy5kZXRlY3Rvci5uYW1lID09PSAnY2xhdWRlJykge1xuICAgICAgICAgICAgdGhpcy5oYWRDbGF1ZGVTdGF0dXMgPSB0cnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBmaWx0ZXJlZERhdGE6IHN0YXR1cy5maWx0ZXJlZERhdGEsXG4gICAgICAgICAgICBhY3Rpdml0eToge1xuICAgICAgICAgICAgICBpc0FjdGl2ZTogdHJ1ZSxcbiAgICAgICAgICAgICAgbGFzdEFjdGl2aXR5VGltZTogdGhpcy5sYXN0QWN0aXZpdHlUaW1lLFxuICAgICAgICAgICAgICBzcGVjaWZpY1N0YXR1czoge1xuICAgICAgICAgICAgICAgIGFwcDogdGhpcy5kZXRlY3Rvci5uYW1lLFxuICAgICAgICAgICAgICAgIHN0YXR1czogc3RhdHVzLmRpc3BsYXlUZXh0LFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dnZXIuZXJyb3IoYEVycm9yIGluICR7dGhpcy5kZXRlY3Rvci5uYW1lfSBzdGF0dXMgcGFyc2VyOmAsIGVycm9yKTtcbiAgICAgICAgLy8gQ29udGludWUgd2l0aCB1bmZpbHRlcmVkIGRhdGEgaWYgcGFyc2luZyBmYWlsc1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEdlbmVyaWMgYWN0aXZpdHkgZGV0ZWN0aW9uIC0gdXNlIGdldEFjdGl2aXR5U3RhdGUgZm9yIGNvbnNpc3RlbnQgdGltZS1iYXNlZCBjaGVja2luZ1xuICAgIHJldHVybiB7XG4gICAgICBmaWx0ZXJlZERhdGE6IGRhdGEsXG4gICAgICBhY3Rpdml0eTogdGhpcy5nZXRBY3Rpdml0eVN0YXRlKCksXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXQgY2FsbGJhY2sgZm9yIENsYXVkZSB0dXJuIG5vdGlmaWNhdGlvbnNcbiAgICovXG4gIHNldE9uQ2xhdWRlVHVybihjYWxsYmFjazogKHNlc3Npb25JZDogc3RyaW5nKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5vbkNsYXVkZVR1cm5DYWxsYmFjayA9IGNhbGxiYWNrO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBjdXJyZW50IGFjdGl2aXR5IHN0YXRlIChmb3IgcGVyaW9kaWMgdXBkYXRlcylcbiAgICovXG4gIGdldEFjdGl2aXR5U3RhdGUoKTogQWN0aXZpdHlTdGF0ZSB7XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCBpc0FjdGl2ZSA9IG5vdyAtIHRoaXMubGFzdEFjdGl2aXR5VGltZSA8IHRoaXMuQUNUSVZJVFlfVElNRU9VVDtcblxuICAgIC8vIENsZWFyIHN0YXR1cyBpZiB3ZSBoYXZlbid0IHNlZW4gaXQgZm9yIGEgd2hpbGVcbiAgICBpZiAodGhpcy5jdXJyZW50U3RhdHVzICYmIG5vdyAtIHRoaXMubGFzdFN0YXR1c1RpbWUgPiB0aGlzLlNUQVRVU19USU1FT1VUKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NsZWFyaW5nIHN0YWxlIHN0YXR1cyAtIG5vdCBzZWVuIGZvcicsIHRoaXMuU1RBVFVTX1RJTUVPVVQsICdtcycpO1xuICAgICAgdGhpcy5jdXJyZW50U3RhdHVzID0gbnVsbDtcblxuICAgICAgLy8gQ2hlY2sgaWYgdGhpcyB3YXMgYSBDbGF1ZGUgc3RhdHVzIGNsZWFyaW5nXG4gICAgICBpZiAodGhpcy5oYWRDbGF1ZGVTdGF0dXMgJiYgdGhpcy5kZXRlY3Rvcj8ubmFtZSA9PT0gJ2NsYXVkZScpIHtcbiAgICAgICAgbG9nZ2VyLmxvZyhcIkNsYXVkZSB0dXJuIGRldGVjdGVkIC0gc3RhdHVzIGNsZWFyZWQsIGl0J3MgdGhlIHVzZXIncyB0dXJuXCIpO1xuICAgICAgICBpZiAodGhpcy5vbkNsYXVkZVR1cm5DYWxsYmFjayAmJiB0aGlzLnNlc3Npb25JZCkge1xuICAgICAgICAgIHRoaXMub25DbGF1ZGVUdXJuQ2FsbGJhY2sodGhpcy5zZXNzaW9uSWQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuaGFkQ2xhdWRlU3RhdHVzID0gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gSWYgd2UgaGF2ZSBhIHNwZWNpZmljIHN0YXR1cyAobGlrZSBDbGF1ZGUgcnVubmluZyksIGFsd2F5cyBzaG93IGl0XG4gICAgLy8gVGhlIGFjdGl2aXR5IGluZGljYXRvciBpbiB0aGUgdGl0bGUgd2lsbCBzaG93IGlmIGl0J3MgYWN0aXZlIG9yIG5vdFxuICAgIHJldHVybiB7XG4gICAgICBpc0FjdGl2ZSxcbiAgICAgIGxhc3RBY3Rpdml0eVRpbWU6IHRoaXMubGFzdEFjdGl2aXR5VGltZSxcbiAgICAgIHNwZWNpZmljU3RhdHVzOlxuICAgICAgICB0aGlzLmN1cnJlbnRTdGF0dXMgJiYgdGhpcy5kZXRlY3RvclxuICAgICAgICAgID8ge1xuICAgICAgICAgICAgICBhcHA6IHRoaXMuZGV0ZWN0b3IubmFtZSxcbiAgICAgICAgICAgICAgc3RhdHVzOiB0aGlzLmN1cnJlbnRTdGF0dXMuZGlzcGxheVRleHQsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgOiB1bmRlZmluZWQsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhciBjdXJyZW50IHN0YXR1cyAoZS5nLiwgd2hlbiBzZXNzaW9uIGVuZHMpXG4gICAqL1xuICBjbGVhclN0YXR1cygpOiB2b2lkIHtcbiAgICB0aGlzLmN1cnJlbnRTdGF0dXMgPSBudWxsO1xuICB9XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBuZXcgYXBwIGRldGVjdG9yXG4gKlxuICogQHBhcmFtIGRldGVjdG9yIFRoZSBkZXRlY3RvciB0byByZWdpc3RlclxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJEZXRlY3RvcihkZXRlY3RvcjogQXBwRGV0ZWN0b3IpOiB2b2lkIHtcbiAgY29uc3QgZXhpc3RpbmcgPSBkZXRlY3RvcnMuZmluZEluZGV4KChkKSA9PiBkLm5hbWUgPT09IGRldGVjdG9yLm5hbWUpO1xuICBpZiAoZXhpc3RpbmcgPj0gMCkge1xuICAgIGRldGVjdG9yc1tleGlzdGluZ10gPSBkZXRlY3RvcjtcbiAgICBsb2dnZXIuZGVidWcoYFVwZGF0ZWQgJHtkZXRlY3Rvci5uYW1lfSBkZXRlY3RvcmApO1xuICB9IGVsc2Uge1xuICAgIGRldGVjdG9ycy5wdXNoKGRldGVjdG9yKTtcbiAgICBsb2dnZXIuZGVidWcoYFJlZ2lzdGVyZWQgJHtkZXRlY3Rvci5uYW1lfSBkZXRlY3RvcmApO1xuICB9XG59XG5cbi8qKlxuICogVGVzdCBmdW5jdGlvbiB0byBoZWxwIGRlYnVnIENsYXVkZSBzdGF0dXMgZGV0ZWN0aW9uXG4gKiBAcGFyYW0gdGVzdERhdGEgU2FtcGxlIGRhdGEgdG8gdGVzdCB0aGUgcmVnZXggYWdhaW5zdFxuICovXG5leHBvcnQgZnVuY3Rpb24gdGVzdENsYXVkZVN0YXR1c0RldGVjdGlvbih0ZXN0RGF0YTogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnNvbGUubG9nKCdcXG49PT0gVGVzdGluZyBDbGF1ZGUgU3RhdHVzIERldGVjdGlvbiA9PT0nKTtcbiAgY29uc29sZS5sb2coJ1JhdyBkYXRhIGxlbmd0aDonLCB0ZXN0RGF0YS5sZW5ndGgpO1xuICBjb25zb2xlLmxvZygnUmF3IGRhdGEgKGZpcnN0IDMwMCBjaGFycyk6JywgdGVzdERhdGEuc3Vic3RyaW5nKDAsIDMwMCkucmVwbGFjZSgvXFxuL2csICdcXFxcbicpKTtcblxuICAvLyBUZXN0IHdpdGggY3VycmVudCBpbXBsZW1lbnRhdGlvblxuICBjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZVN0YXR1cyh0ZXN0RGF0YSk7XG4gIGlmIChyZXN1bHQpIHtcbiAgICBjb25zb2xlLmxvZygn4pyFIFN0YXR1cyBkZXRlY3RlZDonLCByZXN1bHQuZGlzcGxheVRleHQpO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUubG9nKCfinYwgTm8gc3RhdHVzIGRldGVjdGVkJyk7XG5cbiAgICAvLyBUcnkgZGlmZmVyZW50IHZhcmlhdGlvbnNcbiAgICBjb25zdCBjbGVhbkRhdGEgPSB0ZXN0RGF0YS5yZXBsYWNlKEFOU0lfUkVHRVgsICcnKTtcbiAgICBjb25zb2xlLmxvZygnXFxuQ2xlYW4gZGF0YSAobm8gQU5TSSk6JywgY2xlYW5EYXRhLnN1YnN0cmluZygwLCAzMDApLnJlcGxhY2UoL1xcbi9nLCAnXFxcXG4nKSk7XG5cbiAgICAvLyBUZXN0IHNpbXBsZXIgcGF0dGVybnNcbiAgICBjb25zdCBwYXR0ZXJucyA9IFtcbiAgICAgIC90b2tlbnMuKmludGVycnVwdC9naSxcbiAgICAgIC9cXGQrcy4qdG9rZW5zL2dpLFxuICAgICAgL1vihpHihpNdXFxzKlxcZCsuKnRva2Vucy9naSxcbiAgICAgIC8oXFx3KynigKYuKlxcZCtzL2dpLFxuICAgIF07XG5cbiAgICBwYXR0ZXJucy5mb3JFYWNoKChwYXR0ZXJuLCBpZHgpID0+IHtcbiAgICAgIGlmIChwYXR0ZXJuLnRlc3QoY2xlYW5EYXRhKSkge1xuICAgICAgICBjb25zb2xlLmxvZyhg4pyTIFBhdHRlcm4gJHtpZHh9IG1hdGNoZXM6YCwgcGF0dGVybi50b1N0cmluZygpKTtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSBwYXR0ZXJuLmV4ZWMoY2xlYW5EYXRhKTtcbiAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coJyAgTWF0Y2g6JywgbWF0Y2hbMF0uc3Vic3RyaW5nKDAsIDEwMCkpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhg4pyXIFBhdHRlcm4gJHtpZHh9IG5vIG1hdGNoOmAsIHBhdHRlcm4udG9TdHJpbmcoKSk7XG4gICAgICB9XG4gICAgICBwYXR0ZXJuLmxhc3RJbmRleCA9IDA7IC8vIFJlc2V0XG4gICAgfSk7XG4gIH1cbiAgY29uc29sZS5sb2coJz09PSBFbmQgVGVzdCA9PT1cXG4nKTtcbn1cbiJdfQ==