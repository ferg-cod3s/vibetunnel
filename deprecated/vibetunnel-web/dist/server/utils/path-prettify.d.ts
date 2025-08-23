/**
 * Convert absolute paths to use ~ for the home directory
 * @param absolutePath The absolute path to prettify
 * @returns The prettified path with ~ for home directory
 */
export declare function prettifyPath(absolutePath: string): string;
/**
 * Convert multiple paths to use ~ for the home directory
 * @param paths Array of absolute paths to prettify
 * @returns Array of prettified paths
 */
export declare function prettifyPaths(paths: string[]): string[];
