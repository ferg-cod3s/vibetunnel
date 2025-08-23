import { Router } from 'express';
import type { TitleMode } from '../../shared/types.js';
import { type PtyManager } from '../pty/index.js';
import type { ActivityMonitor } from '../services/activity-monitor.js';
import type { RemoteRegistry } from '../services/remote-registry.js';
import type { StreamWatcher } from '../services/stream-watcher.js';
import type { TerminalManager } from '../services/terminal-manager.js';
interface SessionRoutesConfig {
    ptyManager: PtyManager;
    terminalManager: TerminalManager;
    streamWatcher: StreamWatcher;
    remoteRegistry: RemoteRegistry | null;
    isHQMode: boolean;
    activityMonitor: ActivityMonitor;
}
export declare function createSessionRoutes(config: SessionRoutesConfig): Router;
export declare function requestTerminalSpawn(params: {
    sessionId: string;
    sessionName: string;
    command: string[];
    workingDir: string;
    titleMode?: TitleMode;
    gitRepoPath?: string;
    gitBranch?: string;
    gitAheadCount?: number;
    gitBehindCount?: number;
    gitHasChanges?: boolean;
    gitIsWorktree?: boolean;
    gitMainRepoPath?: string;
}): Promise<{
    success: boolean;
    error?: string;
}>;
export {};
