/**
 * Unified prompt pattern detection for terminal output
 * Pre-compiled regexes for optimal performance
 */
declare const SHELL_SPECIFIC_PATTERNS: {
    python: RegExp;
    pythonContinuation: RegExp;
    bracketed: RegExp;
    root: RegExp;
    powershell: RegExp;
    zsh: RegExp;
    fish: RegExp;
    bash: RegExp;
    sh: RegExp;
    withEscape: RegExp;
};
export declare namespace PromptDetector {
    /**
     * Check if the entire output is just a prompt (no other content)
     * Used by activity detector to determine if output is meaningful
     */
    function isPromptOnly(data: string): boolean;
    /**
     * Check if output ends with a prompt (for title injection)
     * This is used to determine when to inject terminal title sequences
     */
    function endsWithPrompt(data: string): boolean;
    /**
     * Get specific shell type based on prompt pattern
     * This can be used for shell-specific optimizations in the future
     */
    function getShellType(data: string): keyof typeof SHELL_SPECIFIC_PATTERNS | null;
    /**
     * Clear all caches (useful for tests or memory management)
     */
    function clearCache(): void;
    /**
     * Get cache statistics for monitoring
     */
    function getCacheStats(): {
        size: number;
        maxSize: number;
        hitRate: {
            end: number;
            only: number;
        };
    };
}
export declare const isPromptOnly: typeof PromptDetector.isPromptOnly;
export declare const endsWithPrompt: typeof PromptDetector.endsWithPrompt;
export {};
