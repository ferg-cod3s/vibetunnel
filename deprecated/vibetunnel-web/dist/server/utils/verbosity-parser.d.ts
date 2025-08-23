import { VerbosityLevel } from './logger.js';
/**
 * Parse verbosity level from environment variables
 * Checks VIBETUNNEL_LOG_LEVEL first, then falls back to VIBETUNNEL_DEBUG for backward compatibility
 * @returns The parsed verbosity level or undefined if not set
 */
export declare function parseVerbosityFromEnv(): VerbosityLevel | undefined;
