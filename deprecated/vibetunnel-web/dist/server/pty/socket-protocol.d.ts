/**
 * Unix socket protocol for VibeTunnel IPC
 *
 * Message format (binary):
 * [1 byte: message type]
 * [4 bytes: payload length (big-endian)]
 * [N bytes: payload]
 */
import { Buffer } from 'buffer';
/**
 * Message types for the socket protocol
 */
export declare enum MessageType {
    STDIN_DATA = 1,// Raw stdin data (keyboard input)
    CONTROL_CMD = 2,// Control commands (resize, kill, etc)
    STATUS_UPDATE = 3,// Status updates (Claude status, etc)
    HEARTBEAT = 4,// Keep-alive ping/pong
    ERROR = 5,// Error messages
    STDOUT_SUBSCRIBE = 16,
    METRICS = 17,
    STATUS_REQUEST = 32,// Request server status
    STATUS_RESPONSE = 33,// Server status response
    GIT_FOLLOW_REQUEST = 48,// Enable/disable Git follow mode
    GIT_FOLLOW_RESPONSE = 49,// Response to follow request
    GIT_EVENT_NOTIFY = 50,// Git event notification
    GIT_EVENT_ACK = 51
}
/**
 * Control command types
 */
export interface ControlCommand {
    cmd: string;
    [key: string]: unknown;
}
export interface ResizeCommand extends ControlCommand {
    cmd: 'resize';
    cols: number;
    rows: number;
}
export interface KillCommand extends ControlCommand {
    cmd: 'kill';
    signal?: string | number;
}
export interface ResetSizeCommand extends ControlCommand {
    cmd: 'reset-size';
}
export interface UpdateTitleCommand extends ControlCommand {
    cmd: 'update-title';
    title: string;
}
/**
 * Status update payload
 */
export interface StatusUpdate {
    app: string;
    status: string;
    timestamp?: number;
    [key: string]: unknown;
}
/**
 * Error message payload
 */
export interface ErrorMessage {
    code: string;
    message: string;
    details?: unknown;
}
/**
 * Server status request (empty payload)
 */
export type StatusRequest = Record<string, never>;
/**
 * Server status response
 */
export interface StatusResponse {
    running: boolean;
    port?: number;
    url?: string;
    version?: string;
    buildDate?: string;
    followMode?: {
        enabled: boolean;
        branch?: string;
        repoPath?: string;
    };
}
/**
 * Git follow mode request
 */
export interface GitFollowRequest {
    repoPath?: string;
    branch?: string;
    enable: boolean;
    worktreePath?: string;
    mainRepoPath?: string;
}
/**
 * Git follow mode response
 */
export interface GitFollowResponse {
    success: boolean;
    currentBranch?: string;
    previousBranch?: string;
    error?: string;
}
/**
 * Git event notification
 */
export interface GitEventNotify {
    repoPath: string;
    type: 'checkout' | 'commit' | 'merge' | 'rebase' | 'other';
}
/**
 * Git event acknowledgment
 */
export interface GitEventAck {
    handled: boolean;
}
/**
 * Type-safe mapping of message types to their payload types
 */
export type MessagePayloadMap = {
    [MessageType.STDIN_DATA]: string;
    [MessageType.CONTROL_CMD]: ControlCommand;
    [MessageType.STATUS_UPDATE]: StatusUpdate;
    [MessageType.HEARTBEAT]: Record<string, never>;
    [MessageType.ERROR]: ErrorMessage;
    [MessageType.STATUS_REQUEST]: StatusRequest;
    [MessageType.STATUS_RESPONSE]: StatusResponse;
    [MessageType.GIT_FOLLOW_REQUEST]: GitFollowRequest;
    [MessageType.GIT_FOLLOW_RESPONSE]: GitFollowResponse;
    [MessageType.GIT_EVENT_NOTIFY]: GitEventNotify;
    [MessageType.GIT_EVENT_ACK]: GitEventAck;
};
/**
 * Get the payload type for a given message type
 */
export type MessagePayload<T extends MessageType> = T extends keyof MessagePayloadMap ? MessagePayloadMap[T] : never;
/**
 * Frame a message for transmission
 */
export declare function frameMessage(type: MessageType, payload: Buffer | string | object): Buffer;
/**
 * Parse messages from a buffer
 */
export declare class MessageParser {
    private buffer;
    /**
     * Add data to the parser
     */
    addData(chunk: Buffer): void;
    /**
     * Parse complete messages from the buffer
     */
    parseMessages(): Generator<{
        type: MessageType;
        payload: Buffer;
    }>;
    /**
     * Get the number of bytes waiting to be parsed
     */
    get pendingBytes(): number;
    /**
     * Clear the buffer
     */
    clear(): void;
}
/**
 * High-level message creation helpers
 */
export declare const MessageBuilder: {
    readonly stdin: (data: string) => Buffer;
    readonly resize: (cols: number, rows: number) => Buffer;
    readonly kill: (signal?: string | number) => Buffer;
    readonly resetSize: () => Buffer;
    readonly updateTitle: (title: string) => Buffer;
    readonly status: (app: string, status: string, extra?: Record<string, unknown>) => Buffer;
    readonly heartbeat: () => Buffer;
    readonly error: (code: string, message: string, details?: unknown) => Buffer;
    readonly gitFollowRequest: (request: GitFollowRequest) => Buffer;
    readonly gitFollowResponse: (response: GitFollowResponse) => Buffer;
    readonly gitEventNotify: (event: GitEventNotify) => Buffer;
    readonly gitEventAck: (ack: GitEventAck) => Buffer;
    readonly statusRequest: () => Buffer;
    readonly statusResponse: (response: StatusResponse) => Buffer;
};
/**
 * Parse payload based on message type
 */
export declare function parsePayload(type: MessageType, payload: Buffer): unknown;
