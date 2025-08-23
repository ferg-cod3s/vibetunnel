/**
 * Git-related utility functions shared between client and server
 */
/**
 * Extract the base repository name from a path, handling common worktree patterns
 * @param repoPath Full path to the repository or worktree
 * @returns Base repository name without worktree suffixes
 *
 * Examples:
 * - /path/to/vibetunnel-treetest -> vibetunnel
 * - /path/to/myrepo-worktree -> myrepo
 * - /path/to/project-wt-feature -> project
 * - /path/to/normalrepo -> normalrepo
 */
export declare function getBaseRepoName(repoPath: string): string;
