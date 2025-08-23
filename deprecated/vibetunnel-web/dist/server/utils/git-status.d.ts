/**
 * Shared Git Status Utilities
 *
 * Provides a single implementation for parsing git status output
 * to avoid duplication across the codebase.
 */
export interface GitStatusCounts {
    modified: number;
    added: number;
    staged: number;
    deleted: number;
    ahead: number;
    behind: number;
}
/**
 * Get detailed git status including file counts and ahead/behind info
 * @param workingDir The directory to check git status in
 * @returns Git status counts or null if not a git repository
 */
export declare function getDetailedGitStatus(workingDir: string): Promise<GitStatusCounts>;
