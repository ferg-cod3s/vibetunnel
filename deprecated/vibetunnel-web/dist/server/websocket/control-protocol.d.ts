/**
 * Unified control socket protocol definitions
 */
export type ControlMessageType = 'request' | 'response' | 'event';
export type ControlCategory = 'terminal' | 'git' | 'system' | 'notification';
export interface ControlMessage {
    id: string;
    type: ControlMessageType;
    category: ControlCategory;
    action: string;
    payload?: unknown;
    sessionId?: string;
    userId?: string;
    error?: string;
}
export interface TerminalSpawnRequest {
    sessionId: string;
    workingDirectory?: string;
    command?: string;
    terminalPreference?: string;
    gitRepoPath?: string;
    gitBranch?: string;
    gitAheadCount?: number;
    gitBehindCount?: number;
    gitHasChanges?: boolean;
    gitIsWorktree?: boolean;
    gitMainRepoPath?: string;
}
export interface TerminalSpawnResponse {
    success: boolean;
    pid?: number;
    error?: string;
}
export interface SystemReadyEvent {
    timestamp: number;
    version?: string;
}
export interface SystemPingRequest {
    timestamp: number;
}
export interface SystemPingResponse {
    status: string;
    timestamp: number;
}
export type SessionMonitorAction = 'session-start' | 'session-exit' | 'command-finished' | 'command-error' | 'bell' | 'claude-turn';
export interface SessionMonitorEvent {
    type: SessionMonitorAction;
    sessionId: string;
    sessionName: string;
    timestamp: string;
    exitCode?: number;
    command?: string;
    duration?: number;
    activityStatus?: {
        isActive: boolean;
        app?: string;
    };
}
export declare function createControlMessage(category: ControlCategory, action: string, payload?: unknown, sessionId?: string): ControlMessage;
export declare function createControlResponse(request: ControlMessage, payload?: unknown, error?: string): ControlMessage;
export declare function createControlEvent(category: ControlCategory, action: string, payload?: unknown, sessionId?: string): ControlMessage;
