"use strict";
/**
 * Unified prompt pattern detection for terminal output
 * Pre-compiled regexes for optimal performance
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.endsWithPrompt = exports.isPromptOnly = exports.PromptDetector = void 0;
const logger_js_1 = require("./logger.js");
const logger = (0, logger_js_1.createLogger)('prompt-patterns');
// ANSI escape code pattern for stripping
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes require control characters
const ANSI_ESCAPE_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;
// Single pre-compiled regex combining all prompt patterns
// (?<![.>])         - Negative lookbehind: not preceded by . or > (excludes Python)
// (?:\[[^\]]*\])?   - Optional brackets for user@host, paths, etc
// [$>#%❯➜]         - Common prompt characters
// \s*               - Optional trailing whitespace
// (?:\x1b\[...)?    - Optional ANSI escape sequence
// $                 - End of string anchor
// biome-ignore lint/suspicious/noControlCharactersInRegex: Terminal prompts may contain escape sequences
const UNIFIED_PROMPT_END_REGEX = /(?<![.>])(?:\[[^\]]*\])?[$>#%❯➜]\s*(?:\x1b\[[0-9;]*[a-zA-Z])?$/;
// Regex for detecting if entire output is just a prompt (no other content)
// ^                 - Start of string anchor
// (?:\[[^\]]*\])?   - Optional brackets for user@host, paths, etc
// (?<!^[.>]{2})     - Negative lookbehind: not preceded by .. or >> at start
// [$>#%❯➜]         - Common prompt characters
// \s*               - Optional trailing whitespace
// $                 - End of string anchor
const PROMPT_ONLY_REGEX = /^(?:\[[^\]]*\])?(?<!^[.>]{2})[$>#%❯➜]\s*$/;
// More specific patterns for different shells (for future shell-specific optimizations)
// Order matters - more specific patterns should come first
const SHELL_SPECIFIC_PATTERNS = {
    // Multi-line prompts (like in Python REPL) - check FIRST before PowerShell
    python: /^>>>\s*$/,
    pythonContinuation: /^\.\.\.\s*$/,
    // Bracketed prompts (user@host, git branch, etc.) - check early as they're specific
    bracketed: /\][#$]\s*$/,
    // Root prompt
    root: /#\s*$/,
    // PowerShell - now after Python to avoid false matches
    powershell: /^PS.*>\s*$|^>\s*$/,
    // Modern shells
    zsh: /[%❯]\s*$/,
    fish: /[❯➜]\s*$/,
    // Basic shells - check last as $ is common
    bash: /\$\s*$/,
    sh: /\$\s*$/,
    // With escape sequences (for color prompts)
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Terminal escape sequences
    withEscape: /[$>#%❯➜]\s*\x1b\[/,
};
var PromptDetector;
(function (PromptDetector) {
    // Cache for regex test results to avoid repeated tests
    const endPromptCache = new Map();
    const onlyPromptCache = new Map();
    let cacheSize = 0;
    const MAX_CACHE_SIZE = 1000;
    /**
     * Check if the entire output is just a prompt (no other content)
     * Used by activity detector to determine if output is meaningful
     */
    function isPromptOnly(data) {
        // Input validation
        if (data.length > 10000) {
            logger.warn('Unusually long prompt input detected', { length: data.length });
            return false;
        }
        const trimmed = data.trim();
        // Check cache first
        if (onlyPromptCache.has(trimmed)) {
            const cachedResult = onlyPromptCache.get(trimmed);
            return cachedResult ?? false;
        }
        const result = PROMPT_ONLY_REGEX.test(trimmed);
        // Cache result
        cacheResult(onlyPromptCache, trimmed, result);
        return result;
    }
    PromptDetector.isPromptOnly = isPromptOnly;
    /**
     * Check if output ends with a prompt (for title injection)
     * This is used to determine when to inject terminal title sequences
     */
    function endsWithPrompt(data) {
        // For title injection, we need to check the last part of the output
        // Use last 100 chars as cache key to balance cache efficiency and accuracy
        const cacheKey = data.slice(-100);
        // Check cache first
        if (endPromptCache.has(cacheKey)) {
            const cachedResult = endPromptCache.get(cacheKey);
            return cachedResult ?? false;
        }
        // Strip ANSI codes for more reliable detection
        const cleanData = data.replace(ANSI_ESCAPE_REGEX, '');
        const result = UNIFIED_PROMPT_END_REGEX.test(cleanData);
        // Cache result
        cacheResult(endPromptCache, cacheKey, result);
        if (result) {
            logger.debug('Detected prompt at end of output');
        }
        return result;
    }
    PromptDetector.endsWithPrompt = endsWithPrompt;
    /**
     * Get specific shell type based on prompt pattern
     * This can be used for shell-specific optimizations in the future
     */
    function getShellType(data) {
        const trimmed = data.trim();
        // Check each shell pattern
        for (const [shell, pattern] of Object.entries(SHELL_SPECIFIC_PATTERNS)) {
            if (pattern.test(trimmed)) {
                return shell;
            }
        }
        return null;
    }
    PromptDetector.getShellType = getShellType;
    /**
     * Helper to cache results with size limit
     */
    function cacheResult(cache, key, value) {
        if (cacheSize >= MAX_CACHE_SIZE) {
            // Clear oldest entries when cache is full
            const entriesToDelete = Math.floor(MAX_CACHE_SIZE * 0.2); // Clear 20%
            const iterator = cache.keys();
            for (let i = 0; i < entriesToDelete; i++) {
                const keyToDelete = iterator.next().value;
                if (keyToDelete) {
                    cache.delete(keyToDelete);
                    cacheSize--;
                }
            }
        }
        cache.set(key, value);
        cacheSize++;
    }
    /**
     * Clear all caches (useful for tests or memory management)
     */
    function clearCache() {
        endPromptCache.clear();
        onlyPromptCache.clear();
        cacheSize = 0;
        logger.debug('Prompt pattern caches cleared');
    }
    PromptDetector.clearCache = clearCache;
    /**
     * Get cache statistics for monitoring
     */
    function getCacheStats() {
        return {
            size: cacheSize,
            maxSize: MAX_CACHE_SIZE,
            hitRate: {
                end: endPromptCache.size,
                only: onlyPromptCache.size,
            },
        };
    }
    PromptDetector.getCacheStats = getCacheStats;
})(PromptDetector || (exports.PromptDetector = PromptDetector = {}));
// Export for backward compatibility
exports.isPromptOnly = PromptDetector.isPromptOnly;
exports.endsWithPrompt = PromptDetector.endsWithPrompt;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0LXBhdHRlcm5zLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci91dGlscy9wcm9tcHQtcGF0dGVybnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBRUgsMkNBQTJDO0FBRTNDLE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxpQkFBaUIsQ0FBQyxDQUFDO0FBRS9DLHlDQUF5QztBQUN6Qyx3R0FBd0c7QUFDeEcsTUFBTSxpQkFBaUIsR0FBRyx3QkFBd0IsQ0FBQztBQUVuRCwwREFBMEQ7QUFDMUQsb0ZBQW9GO0FBQ3BGLGtFQUFrRTtBQUNsRSw4Q0FBOEM7QUFDOUMsbURBQW1EO0FBQ25ELG9EQUFvRDtBQUNwRCwyQ0FBMkM7QUFDM0MseUdBQXlHO0FBQ3pHLE1BQU0sd0JBQXdCLEdBQUcsZ0VBQWdFLENBQUM7QUFFbEcsMkVBQTJFO0FBQzNFLDZDQUE2QztBQUM3QyxrRUFBa0U7QUFDbEUsNkVBQTZFO0FBQzdFLDhDQUE4QztBQUM5QyxtREFBbUQ7QUFDbkQsMkNBQTJDO0FBQzNDLE1BQU0saUJBQWlCLEdBQUcsMkNBQTJDLENBQUM7QUFFdEUsd0ZBQXdGO0FBQ3hGLDJEQUEyRDtBQUMzRCxNQUFNLHVCQUF1QixHQUFHO0lBQzlCLDJFQUEyRTtJQUMzRSxNQUFNLEVBQUUsVUFBVTtJQUNsQixrQkFBa0IsRUFBRSxhQUFhO0lBRWpDLG9GQUFvRjtJQUNwRixTQUFTLEVBQUUsWUFBWTtJQUV2QixjQUFjO0lBQ2QsSUFBSSxFQUFFLE9BQU87SUFFYix1REFBdUQ7SUFDdkQsVUFBVSxFQUFFLG1CQUFtQjtJQUUvQixnQkFBZ0I7SUFDaEIsR0FBRyxFQUFFLFVBQVU7SUFDZixJQUFJLEVBQUUsVUFBVTtJQUVoQiwyQ0FBMkM7SUFDM0MsSUFBSSxFQUFFLFFBQVE7SUFDZCxFQUFFLEVBQUUsUUFBUTtJQUVaLDRDQUE0QztJQUM1QyxxRkFBcUY7SUFDckYsVUFBVSxFQUFF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O0lBYmUsNEJBQWEsZ0JBYTVCLENBQUE7QUFDSCxDQUFDLEVBaElnQixjQUFjLDhCQUFkLGNBQWMsUUFnSTlCO0FBRUQsb0NBQW9DO0FBQ3ZCLFFBQUEsWUFBWSxHQUFHLGNBQWMsQ0FBQyxZQUFZLENBQUM7QUFDM0MsUUFBQSxjQUFjLEdBQUcsY0FBYyxDQUFDLGNBQWMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogVW5pZmllZCBwcm9tcHQgcGF0dGVybiBkZXRlY3Rpb24gZm9yIHRlcm1pbmFsIG91dHB1dFxuICogUHJlLWNvbXBpbGVkIHJlZ2V4ZXMgZm9yIG9wdGltYWwgcGVyZm9ybWFuY2VcbiAqL1xuXG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuL2xvZ2dlci5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcigncHJvbXB0LXBhdHRlcm5zJyk7XG5cbi8vIEFOU0kgZXNjYXBlIGNvZGUgcGF0dGVybiBmb3Igc3RyaXBwaW5nXG4vLyBiaW9tZS1pZ25vcmUgbGludC9zdXNwaWNpb3VzL25vQ29udHJvbENoYXJhY3RlcnNJblJlZ2V4OiBBTlNJIGVzY2FwZSBjb2RlcyByZXF1aXJlIGNvbnRyb2wgY2hhcmFjdGVyc1xuY29uc3QgQU5TSV9FU0NBUEVfUkVHRVggPSAvXFx4MWJcXFtbMC05O10qW2EtekEtWl0vZztcblxuLy8gU2luZ2xlIHByZS1jb21waWxlZCByZWdleCBjb21iaW5pbmcgYWxsIHByb21wdCBwYXR0ZXJuc1xuLy8gKD88IVsuPl0pICAgICAgICAgLSBOZWdhdGl2ZSBsb29rYmVoaW5kOiBub3QgcHJlY2VkZWQgYnkgLiBvciA+IChleGNsdWRlcyBQeXRob24pXG4vLyAoPzpcXFtbXlxcXV0qXFxdKT8gICAtIE9wdGlvbmFsIGJyYWNrZXRzIGZvciB1c2VyQGhvc3QsIHBhdGhzLCBldGNcbi8vIFskPiMl4p2v4p6cXSAgICAgICAgIC0gQ29tbW9uIHByb21wdCBjaGFyYWN0ZXJzXG4vLyBcXHMqICAgICAgICAgICAgICAgLSBPcHRpb25hbCB0cmFpbGluZyB3aGl0ZXNwYWNlXG4vLyAoPzpcXHgxYlxcWy4uLik/ICAgIC0gT3B0aW9uYWwgQU5TSSBlc2NhcGUgc2VxdWVuY2Vcbi8vICQgICAgICAgICAgICAgICAgIC0gRW5kIG9mIHN0cmluZyBhbmNob3Jcbi8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Db250cm9sQ2hhcmFjdGVyc0luUmVnZXg6IFRlcm1pbmFsIHByb21wdHMgbWF5IGNvbnRhaW4gZXNjYXBlIHNlcXVlbmNlc1xuY29uc3QgVU5JRklFRF9QUk9NUFRfRU5EX1JFR0VYID0gLyg/PCFbLj5dKSg/OlxcW1teXFxdXSpcXF0pP1skPiMl4p2v4p6cXVxccyooPzpcXHgxYlxcW1swLTk7XSpbYS16QS1aXSk/JC87XG5cbi8vIFJlZ2V4IGZvciBkZXRlY3RpbmcgaWYgZW50aXJlIG91dHB1dCBpcyBqdXN0IGEgcHJvbXB0IChubyBvdGhlciBjb250ZW50KVxuLy8gXiAgICAgICAgICAgICAgICAgLSBTdGFydCBvZiBzdHJpbmcgYW5jaG9yXG4vLyAoPzpcXFtbXlxcXV0qXFxdKT8gICAtIE9wdGlvbmFsIGJyYWNrZXRzIGZvciB1c2VyQGhvc3QsIHBhdGhzLCBldGNcbi8vICg/PCFeWy4+XXsyfSkgICAgIC0gTmVnYXRpdmUgbG9va2JlaGluZDogbm90IHByZWNlZGVkIGJ5IC4uIG9yID4+IGF0IHN0YXJ0XG4vLyBbJD4jJeKdr+KenF0gICAgICAgICAtIENvbW1vbiBwcm9tcHQgY2hhcmFjdGVyc1xuLy8gXFxzKiAgICAgICAgICAgICAgIC0gT3B0aW9uYWwgdHJhaWxpbmcgd2hpdGVzcGFjZVxuLy8gJCAgICAgICAgICAgICAgICAgLSBFbmQgb2Ygc3RyaW5nIGFuY2hvclxuY29uc3QgUFJPTVBUX09OTFlfUkVHRVggPSAvXig/OlxcW1teXFxdXSpcXF0pPyg/PCFeWy4+XXsyfSlbJD4jJeKdr+KenF1cXHMqJC87XG5cbi8vIE1vcmUgc3BlY2lmaWMgcGF0dGVybnMgZm9yIGRpZmZlcmVudCBzaGVsbHMgKGZvciBmdXR1cmUgc2hlbGwtc3BlY2lmaWMgb3B0aW1pemF0aW9ucylcbi8vIE9yZGVyIG1hdHRlcnMgLSBtb3JlIHNwZWNpZmljIHBhdHRlcm5zIHNob3VsZCBjb21lIGZpcnN0XG5jb25zdCBTSEVMTF9TUEVDSUZJQ19QQVRURVJOUyA9IHtcbiAgLy8gTXVsdGktbGluZSBwcm9tcHRzIChsaWtlIGluIFB5dGhvbiBSRVBMKSAtIGNoZWNrIEZJUlNUIGJlZm9yZSBQb3dlclNoZWxsXG4gIHB5dGhvbjogL14+Pj5cXHMqJC8sXG4gIHB5dGhvbkNvbnRpbnVhdGlvbjogL15cXC5cXC5cXC5cXHMqJC8sXG5cbiAgLy8gQnJhY2tldGVkIHByb21wdHMgKHVzZXJAaG9zdCwgZ2l0IGJyYW5jaCwgZXRjLikgLSBjaGVjayBlYXJseSBhcyB0aGV5J3JlIHNwZWNpZmljXG4gIGJyYWNrZXRlZDogL1xcXVsjJF1cXHMqJC8sXG5cbiAgLy8gUm9vdCBwcm9tcHRcbiAgcm9vdDogLyNcXHMqJC8sXG5cbiAgLy8gUG93ZXJTaGVsbCAtIG5vdyBhZnRlciBQeXRob24gdG8gYXZvaWQgZmFsc2UgbWF0Y2hlc1xuICBwb3dlcnNoZWxsOiAvXlBTLio+XFxzKiR8Xj5cXHMqJC8sXG5cbiAgLy8gTW9kZXJuIHNoZWxsc1xuICB6c2g6IC9bJeKdr11cXHMqJC8sXG4gIGZpc2g6IC9b4p2v4p6cXVxccyokLyxcblxuICAvLyBCYXNpYyBzaGVsbHMgLSBjaGVjayBsYXN0IGFzICQgaXMgY29tbW9uXG4gIGJhc2g6IC9cXCRcXHMqJC8sXG4gIHNoOiAvXFwkXFxzKiQvLFxuXG4gIC8vIFdpdGggZXNjYXBlIHNlcXVlbmNlcyAoZm9yIGNvbG9yIHByb21wdHMpXG4gIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Db250cm9sQ2hhcmFjdGVyc0luUmVnZXg6IFRlcm1pbmFsIGVzY2FwZSBzZXF1ZW5jZXNcbiAgd2l0aEVzY2FwZTogL1skPiMl4p2v4p6cXVxccypcXHgxYlxcWy8sXG59O1xuXG5leHBvcnQgbmFtZXNwYWNlIFByb21wdERldGVjdG9yIHtcbiAgLy8gQ2FjaGUgZm9yIHJlZ2V4IHRlc3QgcmVzdWx0cyB0byBhdm9pZCByZXBlYXRlZCB0ZXN0c1xuICBjb25zdCBlbmRQcm9tcHRDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBib29sZWFuPigpO1xuICBjb25zdCBvbmx5UHJvbXB0Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgYm9vbGVhbj4oKTtcbiAgbGV0IGNhY2hlU2l6ZSA9IDA7XG4gIGNvbnN0IE1BWF9DQUNIRV9TSVpFID0gMTAwMDtcblxuICAvKipcbiAgICogQ2hlY2sgaWYgdGhlIGVudGlyZSBvdXRwdXQgaXMganVzdCBhIHByb21wdCAobm8gb3RoZXIgY29udGVudClcbiAgICogVXNlZCBieSBhY3Rpdml0eSBkZXRlY3RvciB0byBkZXRlcm1pbmUgaWYgb3V0cHV0IGlzIG1lYW5pbmdmdWxcbiAgICovXG4gIGV4cG9ydCBmdW5jdGlvbiBpc1Byb21wdE9ubHkoZGF0YTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgLy8gSW5wdXQgdmFsaWRhdGlvblxuICAgIGlmIChkYXRhLmxlbmd0aCA+IDEwMDAwKSB7XG4gICAgICBsb2dnZXIud2FybignVW51c3VhbGx5IGxvbmcgcHJvbXB0IGlucHV0IGRldGVjdGVkJywgeyBsZW5ndGg6IGRhdGEubGVuZ3RoIH0pO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHRyaW1tZWQgPSBkYXRhLnRyaW0oKTtcblxuICAgIC8vIENoZWNrIGNhY2hlIGZpcnN0XG4gICAgaWYgKG9ubHlQcm9tcHRDYWNoZS5oYXModHJpbW1lZCkpIHtcbiAgICAgIGNvbnN0IGNhY2hlZFJlc3VsdCA9IG9ubHlQcm9tcHRDYWNoZS5nZXQodHJpbW1lZCk7XG4gICAgICByZXR1cm4gY2FjaGVkUmVzdWx0ID8/IGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdCA9IFBST01QVF9PTkxZX1JFR0VYLnRlc3QodHJpbW1lZCk7XG5cbiAgICAvLyBDYWNoZSByZXN1bHRcbiAgICBjYWNoZVJlc3VsdChvbmx5UHJvbXB0Q2FjaGUsIHRyaW1tZWQsIHJlc3VsdCk7XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrIGlmIG91dHB1dCBlbmRzIHdpdGggYSBwcm9tcHQgKGZvciB0aXRsZSBpbmplY3Rpb24pXG4gICAqIFRoaXMgaXMgdXNlZCB0byBkZXRlcm1pbmUgd2hlbiB0byBpbmplY3QgdGVybWluYWwgdGl0bGUgc2VxdWVuY2VzXG4gICAqL1xuICBleHBvcnQgZnVuY3Rpb24gZW5kc1dpdGhQcm9tcHQoZGF0YTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgLy8gRm9yIHRpdGxlIGluamVjdGlvbiwgd2UgbmVlZCB0byBjaGVjayB0aGUgbGFzdCBwYXJ0IG9mIHRoZSBvdXRwdXRcbiAgICAvLyBVc2UgbGFzdCAxMDAgY2hhcnMgYXMgY2FjaGUga2V5IHRvIGJhbGFuY2UgY2FjaGUgZWZmaWNpZW5jeSBhbmQgYWNjdXJhY3lcbiAgICBjb25zdCBjYWNoZUtleSA9IGRhdGEuc2xpY2UoLTEwMCk7XG5cbiAgICAvLyBDaGVjayBjYWNoZSBmaXJzdFxuICAgIGlmIChlbmRQcm9tcHRDYWNoZS5oYXMoY2FjaGVLZXkpKSB7XG4gICAgICBjb25zdCBjYWNoZWRSZXN1bHQgPSBlbmRQcm9tcHRDYWNoZS5nZXQoY2FjaGVLZXkpO1xuICAgICAgcmV0dXJuIGNhY2hlZFJlc3VsdCA/PyBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyBTdHJpcCBBTlNJIGNvZGVzIGZvciBtb3JlIHJlbGlhYmxlIGRldGVjdGlvblxuICAgIGNvbnN0IGNsZWFuRGF0YSA9IGRhdGEucmVwbGFjZShBTlNJX0VTQ0FQRV9SRUdFWCwgJycpO1xuICAgIGNvbnN0IHJlc3VsdCA9IFVOSUZJRURfUFJPTVBUX0VORF9SRUdFWC50ZXN0KGNsZWFuRGF0YSk7XG5cbiAgICAvLyBDYWNoZSByZXN1bHRcbiAgICBjYWNoZVJlc3VsdChlbmRQcm9tcHRDYWNoZSwgY2FjaGVLZXksIHJlc3VsdCk7XG5cbiAgICBpZiAocmVzdWx0KSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0RldGVjdGVkIHByb21wdCBhdCBlbmQgb2Ygb3V0cHV0Jyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgc3BlY2lmaWMgc2hlbGwgdHlwZSBiYXNlZCBvbiBwcm9tcHQgcGF0dGVyblxuICAgKiBUaGlzIGNhbiBiZSB1c2VkIGZvciBzaGVsbC1zcGVjaWZpYyBvcHRpbWl6YXRpb25zIGluIHRoZSBmdXR1cmVcbiAgICovXG4gIGV4cG9ydCBmdW5jdGlvbiBnZXRTaGVsbFR5cGUoZGF0YTogc3RyaW5nKToga2V5b2YgdHlwZW9mIFNIRUxMX1NQRUNJRklDX1BBVFRFUk5TIHwgbnVsbCB7XG4gICAgY29uc3QgdHJpbW1lZCA9IGRhdGEudHJpbSgpO1xuXG4gICAgLy8gQ2hlY2sgZWFjaCBzaGVsbCBwYXR0ZXJuXG4gICAgZm9yIChjb25zdCBbc2hlbGwsIHBhdHRlcm5dIG9mIE9iamVjdC5lbnRyaWVzKFNIRUxMX1NQRUNJRklDX1BBVFRFUk5TKSkge1xuICAgICAgaWYgKHBhdHRlcm4udGVzdCh0cmltbWVkKSkge1xuICAgICAgICByZXR1cm4gc2hlbGwgYXMga2V5b2YgdHlwZW9mIFNIRUxMX1NQRUNJRklDX1BBVFRFUk5TO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLyoqXG4gICAqIEhlbHBlciB0byBjYWNoZSByZXN1bHRzIHdpdGggc2l6ZSBsaW1pdFxuICAgKi9cbiAgZnVuY3Rpb24gY2FjaGVSZXN1bHQoY2FjaGU6IE1hcDxzdHJpbmcsIGJvb2xlYW4+LCBrZXk6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBpZiAoY2FjaGVTaXplID49IE1BWF9DQUNIRV9TSVpFKSB7XG4gICAgICAvLyBDbGVhciBvbGRlc3QgZW50cmllcyB3aGVuIGNhY2hlIGlzIGZ1bGxcbiAgICAgIGNvbnN0IGVudHJpZXNUb0RlbGV0ZSA9IE1hdGguZmxvb3IoTUFYX0NBQ0hFX1NJWkUgKiAwLjIpOyAvLyBDbGVhciAyMCVcbiAgICAgIGNvbnN0IGl0ZXJhdG9yID0gY2FjaGUua2V5cygpO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBlbnRyaWVzVG9EZWxldGU7IGkrKykge1xuICAgICAgICBjb25zdCBrZXlUb0RlbGV0ZSA9IGl0ZXJhdG9yLm5leHQoKS52YWx1ZTtcbiAgICAgICAgaWYgKGtleVRvRGVsZXRlKSB7XG4gICAgICAgICAgY2FjaGUuZGVsZXRlKGtleVRvRGVsZXRlKTtcbiAgICAgICAgICBjYWNoZVNpemUtLTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGNhY2hlLnNldChrZXksIHZhbHVlKTtcbiAgICBjYWNoZVNpemUrKztcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhciBhbGwgY2FjaGVzICh1c2VmdWwgZm9yIHRlc3RzIG9yIG1lbW9yeSBtYW5hZ2VtZW50KVxuICAgKi9cbiAgZXhwb3J0IGZ1bmN0aW9uIGNsZWFyQ2FjaGUoKTogdm9pZCB7XG4gICAgZW5kUHJvbXB0Q2FjaGUuY2xlYXIoKTtcbiAgICBvbmx5UHJvbXB0Q2FjaGUuY2xlYXIoKTtcbiAgICBjYWNoZVNpemUgPSAwO1xuICAgIGxvZ2dlci5kZWJ1ZygnUHJvbXB0IHBhdHRlcm4gY2FjaGVzIGNsZWFyZWQnKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgY2FjaGUgc3RhdGlzdGljcyBmb3IgbW9uaXRvcmluZ1xuICAgKi9cbiAgZXhwb3J0IGZ1bmN0aW9uIGdldENhY2hlU3RhdHMoKToge1xuICAgIHNpemU6IG51bWJlcjtcbiAgICBtYXhTaXplOiBudW1iZXI7XG4gICAgaGl0UmF0ZTogeyBlbmQ6IG51bWJlcjsgb25seTogbnVtYmVyIH07XG4gIH0ge1xuICAgIHJldHVybiB7XG4gICAgICBzaXplOiBjYWNoZVNpemUsXG4gICAgICBtYXhTaXplOiBNQVhfQ0FDSEVfU0laRSxcbiAgICAgIGhpdFJhdGU6IHtcbiAgICAgICAgZW5kOiBlbmRQcm9tcHRDYWNoZS5zaXplLFxuICAgICAgICBvbmx5OiBvbmx5UHJvbXB0Q2FjaGUuc2l6ZSxcbiAgICAgIH0sXG4gICAgfTtcbiAgfVxufVxuXG4vLyBFeHBvcnQgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbmV4cG9ydCBjb25zdCBpc1Byb21wdE9ubHkgPSBQcm9tcHREZXRlY3Rvci5pc1Byb21wdE9ubHk7XG5leHBvcnQgY29uc3QgZW5kc1dpdGhQcm9tcHQgPSBQcm9tcHREZXRlY3Rvci5lbmRzV2l0aFByb21wdDtcbiJdfQ==