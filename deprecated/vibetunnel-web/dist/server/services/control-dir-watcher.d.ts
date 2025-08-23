import type { PtyManager } from '../pty/index.js';
import type { HQClient } from './hq-client.js';
import type { PushNotificationService } from './push-notification-service.js';
import type { RemoteRegistry } from './remote-registry.js';
interface ControlDirWatcherConfig {
    controlDir: string;
    remoteRegistry: RemoteRegistry | null;
    isHQMode: boolean;
    hqClient: HQClient | null;
    ptyManager?: PtyManager;
    pushNotificationService?: PushNotificationService;
}
export declare class ControlDirWatcher {
    private watcher;
    private config;
    private recentlyNotifiedSessions;
    constructor(config: ControlDirWatcherConfig);
    start(): void;
    private handleFileChange;
    private notifyHQAboutSession;
    stop(): void;
}
export {};
