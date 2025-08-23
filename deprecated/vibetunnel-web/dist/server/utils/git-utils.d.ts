/**
 * Get the main repository path for a given path
 * @param gitPath Path that might be a worktree or main repo
 * @returns Main repository path
 */
export declare function getMainRepositoryPath(gitPath: string): Promise<string>;
/**
 * Check if a path is a git worktree
 * @param gitPath Path to check
 * @returns True if the path is a worktree
 */
export declare function isWorktree(gitPath: string): Promise<boolean>;
