/**
 * Git command error with additional context
 */
export interface GitError extends Error {
    code?: string;
    stderr?: string;
    exitCode?: number;
}
/**
 * Type guard to check if an error is a GitError
 */
export declare function isGitError(error: unknown): error is GitError;
/**
 * Create a GitError from an unknown error
 */
export declare function createGitError(error: unknown, context?: string): GitError;
/**
 * Check if a GitError indicates the git command was not found
 */
export declare function isGitNotFoundError(error: unknown): boolean;
/**
 * Check if a GitError indicates we're not in a git repository
 */
export declare function isNotGitRepositoryError(error: unknown): boolean;
/**
 * Check if a GitError is due to a missing config key
 */
export declare function isGitConfigNotFoundError(error: unknown): boolean;
