/**
 * Activity detection system for terminal output
 *
 * Provides generic activity tracking and app-specific status parsing
 * for enhanced terminal title updates in dynamic mode.
 */
/**
 * Activity status returned by app-specific parsers
 */
export interface ActivityStatus {
    /** The output data with status lines filtered out */
    filteredData: string;
    /** Human-readable status text for display in title */
    displayText: string;
    /** Raw status data for potential future use */
    raw?: {
        indicator?: string;
        action?: string;
        duration?: number;
        progress?: string;
    };
}
/**
 * Current activity state for a terminal session
 */
export interface ActivityState {
    /** Whether the terminal is currently active */
    isActive: boolean;
    /** Timestamp of last activity */
    lastActivityTime: number;
    /** App-specific status if detected */
    specificStatus?: {
        app: string;
        status: string;
    };
}
/**
 * App-specific detector interface
 */
export interface AppDetector {
    /** Name of the app this detector handles */
    name: string;
    /** Check if this detector should be used for the given command */
    detect: (command: string[]) => boolean;
    /** Parse app-specific status from output data */
    parseStatus: (data: string) => ActivityStatus | null;
}
/**
 * Activity detector for a terminal session
 *
 * Tracks general activity and provides app-specific status parsing
 */
export declare class ActivityDetector {
    private lastActivityTime;
    private currentStatus;
    private detector;
    private lastStatusTime;
    private readonly ACTIVITY_TIMEOUT;
    private readonly STATUS_TIMEOUT;
    private readonly MEANINGFUL_OUTPUT_THRESHOLD;
    private hadClaudeStatus;
    private onClaudeTurnCallback?;
    private sessionId?;
    constructor(command: string[], sessionId?: string);
    /**
     * Check if output is just a prompt
     */
    private isJustPrompt;
    /**
     * Process terminal output and extract activity information
     */
    processOutput(data: string): {
        filteredData: string;
        activity: ActivityState;
    };
    /**
     * Set callback for Claude turn notifications
     */
    setOnClaudeTurn(callback: (sessionId: string) => void): void;
    /**
     * Get current activity state (for periodic updates)
     */
    getActivityState(): ActivityState;
    /**
     * Clear current status (e.g., when session ends)
     */
    clearStatus(): void;
}
/**
 * Register a new app detector
 *
 * @param detector The detector to register
 */
export declare function registerDetector(detector: AppDetector): void;
/**
 * Test function to help debug Claude status detection
 * @param testData Sample data to test the regex against
 */
export declare function testClaudeStatusDetection(testData: string): void;
