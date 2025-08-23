/**
 * Terminal title management utilities
 *
 * Generates and injects terminal title sequences based on working directory
 * and running command.
 */
import type { ActivityState } from './activity-detector.js';
/**
 * Generate a terminal title sequence (OSC 2)
 *
 * @param cwd Current working directory
 * @param command Command being run
 * @param sessionName Optional session name
 * @returns Terminal title escape sequence
 */
export declare function generateTitleSequence(cwd: string, command: string[], sessionName?: string): string;
/**
 * Extract directory change from cd command
 *
 * @param input The input command string
 * @param currentDir Current working directory
 * @returns New directory if cd command detected, null otherwise
 */
export declare function extractCdDirectory(input: string, currentDir: string): string | null;
/**
 * Check if we should inject a title update
 *
 * @param data The terminal output data
 * @returns True if this looks like a good time to inject a title
 */
export declare function shouldInjectTitle(data: string): boolean;
/**
 * Inject title sequence into terminal output if appropriate
 *
 * @param data The terminal output data
 * @param title The title sequence to inject
 * @returns Data with title sequence injected if appropriate
 */
export declare function injectTitleIfNeeded(data: string, title: string): string;
/**
 * Generate a dynamic terminal title with activity indicators
 *
 * @param cwd Current working directory
 * @param command Command being run
 * @param activity Current activity state
 * @param sessionName Optional session name
 * @param gitRepoPath Optional Git repository path
 * @param gitBranch Optional Git branch name
 * @returns Terminal title escape sequence
 */
export declare function generateDynamicTitle(cwd: string, command: string[], activity: ActivityState, sessionName?: string, gitRepoPath?: string, gitBranch?: string): string;
