/**
 * Path utilities for server-side path operations
 */
/**
 * Expand tilde (~) in file paths to the user's home directory
 * @param filePath The path to expand
 * @returns The expanded path
 */
export declare function expandTildePath(filePath: string): string;
/**
 * Resolve a path to an absolute path, expanding tilde if present
 * @param filePath The path to resolve
 * @returns The absolute path
 */
export declare function resolveAbsolutePath(filePath: string): string;
