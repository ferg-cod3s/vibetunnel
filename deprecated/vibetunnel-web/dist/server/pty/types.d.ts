/**
 * TypeScript interfaces and types for PTY management
 *
 * These types match the tty-fwd format to ensure compatibility
 */
import type * as fs from 'fs';
import type * as net from 'net';
import type { IPty } from 'node-pty';
import type { SessionInfo, TitleMode } from '../../shared/types.js';
import type { ActivityDetector } from '../utils/activity-detector.js';
import type { TitleSequenceFilter } from '../utils/ansi-title-filter.js';
import type { WriteQueue } from '../utils/write-queue.js';
import type { AsciinemaWriter } from './asciinema-writer.js';
export interface AsciinemaHeader {
    version: number;
    width: number;
    height: number;
    timestamp?: number;
    duration?: number;
    command?: string;
    title?: string;
    env?: Record<string, string>;
    theme?: AsciinemaTheme;
}
export interface AsciinemaTheme {
    fg?: string;
    bg?: string;
    palette?: string;
}
export interface ControlMessage {
    cmd: string;
    [key: string]: unknown;
}
export interface ResizeControlMessage extends ControlMessage {
    cmd: 'resize';
    cols: number;
    rows: number;
}
export interface KillControlMessage extends ControlMessage {
    cmd: 'kill';
    signal?: string | number;
}
export interface ResetSizeControlMessage extends ControlMessage {
    cmd: 'reset-size';
}
export type AsciinemaEvent = {
    time: number;
    type: 'o' | 'i' | 'r' | 'm';
    data: string;
};
export interface PtySession {
    id: string;
    sessionInfo: SessionInfo;
    ptyProcess?: IPty;
    asciinemaWriter?: AsciinemaWriter;
    controlDir: string;
    stdoutPath: string;
    stdinPath: string;
    sessionJsonPath: string;
    startTime: Date;
    inputSocketServer?: net.Server;
    stdoutQueue?: WriteQueue;
    inputQueue?: WriteQueue;
    titleMode?: TitleMode;
    currentWorkingDir?: string;
    initialTitleSent?: boolean;
    activityDetector?: ActivityDetector;
    titleUpdateInterval?: NodeJS.Timeout;
    activityFileWritten?: boolean;
    isExternalTerminal: boolean;
    titleFilter?: TitleSequenceFilter;
    titleUpdateNeeded?: boolean;
    currentTitle?: string;
    lastActivityStatus?: string;
    lastWriteTimestamp?: number;
    titleInjectionTimer?: NodeJS.Timeout;
    pendingTitleToInject?: string;
    titleInjectionInProgress?: boolean;
    sessionJsonWatcher?: fs.FSWatcher;
    sessionJsonInterval?: NodeJS.Timeout;
    activityStatus?: {
        specificStatus?: {
            app: string;
            status: string;
        };
    };
    connectedClients?: Set<net.Socket>;
    shellPgid?: number;
    currentForegroundPgid?: number;
    currentCommand?: string;
    commandStartTime?: number;
    processPollingInterval?: NodeJS.Timeout;
    isTmuxAttachment?: boolean;
}
export declare class PtyError extends Error {
    readonly code?: string | undefined;
    readonly sessionId?: string | undefined;
    constructor(message: string, code?: string | undefined, sessionId?: string | undefined);
}
export interface SessionCreationResult {
    sessionId: string;
    sessionInfo: SessionInfo;
}
