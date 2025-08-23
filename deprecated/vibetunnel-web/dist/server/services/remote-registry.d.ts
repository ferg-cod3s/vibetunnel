export interface RemoteServer {
    id: string;
    name: string;
    url: string;
    token: string;
    registeredAt: Date;
    lastHeartbeat: Date;
    sessionIds: Set<string>;
}
export declare class RemoteRegistry {
    private remotes;
    private remotesByName;
    private sessionToRemote;
    private healthCheckInterval;
    private readonly HEALTH_CHECK_INTERVAL;
    private readonly HEALTH_CHECK_TIMEOUT;
    constructor();
    register(remote: Omit<RemoteServer, 'registeredAt' | 'lastHeartbeat' | 'sessionIds'>): RemoteServer;
    unregister(remoteId: string): boolean;
    getRemote(remoteId: string): RemoteServer | undefined;
    getRemoteByUrl(url: string): RemoteServer | undefined;
    getRemotes(): RemoteServer[];
    getRemoteBySessionId(sessionId: string): RemoteServer | undefined;
    updateRemoteSessions(remoteId: string, sessionIds: string[]): void;
    addSessionToRemote(remoteId: string, sessionId: string): void;
    removeSessionFromRemote(sessionId: string): void;
    private checkRemoteHealth;
    private startHealthChecker;
    destroy(): void;
}
