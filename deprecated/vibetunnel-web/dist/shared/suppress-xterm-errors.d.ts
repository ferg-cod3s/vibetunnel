/**
 * Shared module to suppress xterm.js parsing errors in both client and server environments
 *
 * This module provides a unified way to suppress noisy xterm.js parsing errors that occur
 * when the terminal encounters unsupported or proprietary escape sequences. These errors
 * are harmless but create significant console noise.
 *
 * Usage: Import and call suppressXtermErrors() at the very beginning of your entry point
 */
declare global {
    namespace NodeJS {
        interface Global {
            __xtermErrorsSuppressed?: boolean;
        }
    }
}
/**
 * Suppresses xterm.js parsing errors by overriding console methods
 * Works in both Node.js and browser environments
 */
export declare function suppressXtermErrors(): void;
/**
 * Restore original console methods (useful for testing)
 */
export declare function restoreConsole(): void;
