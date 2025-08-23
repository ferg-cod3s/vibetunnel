export declare function patchClaudeBinary(claudePath: string): string;
/**
 * Checks if a command is the Claude CLI binary and patches it if necessary.
 *
 * @param command - The command array from fwd.ts (e.g., ["claude", "--resume"])
 * @returns The potentially patched command array
 */
export declare function checkAndPatchClaude(command: string[]): string[];
