/**
 * Install Git hooks for VibeTunnel follow mode
 */
export declare function installGitHooks(repoPath: string): Promise<{
    success: boolean;
    errors?: string[];
}>;
/**
 * Uninstall Git hooks for VibeTunnel follow mode
 */
export declare function uninstallGitHooks(repoPath: string): Promise<{
    success: boolean;
    errors?: string[];
}>;
/**
 * Check if Git hooks are installed
 */
export declare function areHooksInstalled(repoPath: string): Promise<boolean>;
