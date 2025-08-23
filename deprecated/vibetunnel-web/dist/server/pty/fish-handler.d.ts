/**
 * Fish Shell Handler
 *
 * Provides fish shell tab completion support.
 */
/**
 * FishHandler - Provides intelligent tab completion support for the Fish shell
 *
 * This class integrates with Fish shell's built-in completion system to provide
 * context-aware command and argument suggestions. It handles the complexity of
 * spawning Fish processes, managing timeouts, and parsing completion results.
 *
 * Key features:
 * - Leverages Fish's powerful built-in completion engine
 * - Handles process timeouts to prevent hanging
 * - Safely escapes input to prevent injection attacks
 * - Parses Fish's tab-separated completion format
 * - Provides shell detection and version checking utilities
 *
 * @example
 * ```typescript
 * import { fishHandler } from './fish-handler';
 *
 * // Get completions for a partial command
 * const completions = await fishHandler.getCompletions('git co', '/home/user/project');
 * // Returns: ['commit', 'config', 'checkout', ...]
 *
 * // Check if a shell path is Fish
 * if (FishHandler.isFishShell('/usr/local/bin/fish')) {
 *   // Use Fish-specific features
 *   const version = await FishHandler.getFishVersion();
 *   console.log(`Fish version: ${version}`);
 * }
 * ```
 */
export declare class FishHandler {
    /**
     * Get completion suggestions for a partial command
     */
    getCompletions(partial: string, cwd?: string): Promise<string[]>;
    /**
     * Check if the current shell is fish
     */
    static isFishShell(shellPath: string): boolean;
    /**
     * Get fish shell version
     */
    static getFishVersion(): Promise<string | null>;
}
export declare const fishHandler: FishHandler;
