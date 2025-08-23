/**
 * Abbreviate a file path to make it more readable
 * Examples:
 *   /Users/john/Projects/myproject -> ~/Projects/myproject
 *   /Users/john/Development/vibetunnel/web -> ~/Dev/vibetunnel/web
 *   /very/long/path/to/some/directory -> …/some/directory
 */
export declare function abbreviatePath(fullPath: string): string;
/**
 * Generate a human-readable session name
 * Format: commandName (abbreviatedPath)
 * Examples:
 *   claude (~/Dev/vibetunnel/web)
 *   bash (~/Projects/myapp)
 *   python3 (~)
 */
export declare function generateSessionName(command: string[], workingDir: string): string;
