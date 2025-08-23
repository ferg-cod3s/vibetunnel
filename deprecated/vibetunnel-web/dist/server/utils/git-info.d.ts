/**
 * Git information detection utilities
 */
/**
 * Git repository information
 */
export interface GitInfo {
    gitRepoPath?: string;
    gitBranch?: string;
    gitAheadCount?: number;
    gitBehindCount?: number;
    gitHasChanges?: boolean;
    gitIsWorktree?: boolean;
    gitMainRepoPath?: string;
}
/**
 * Detect Git repository information for a given directory
 */
export declare function detectGitInfo(workingDir: string): Promise<GitInfo>;
/**
 * Clear the Git info cache
 */
export declare function clearGitInfoCache(): void;
/**
 * Clear cache entry for a specific directory
 */
export declare function clearGitInfoCacheForDir(workingDir: string): void;
