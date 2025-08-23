export interface TailscaleServeService {
    start(port: number): Promise<void>;
    stop(): Promise<void>;
    isRunning(): boolean;
    getStatus(): Promise<TailscaleServeStatus>;
}
export interface TailscaleServeStatus {
    isRunning: boolean;
    port?: number;
    error?: string;
    lastError?: string;
    startTime?: Date;
}
/**
 * Service to manage Tailscale Serve as a background process
 */
export declare class TailscaleServeServiceImpl implements TailscaleServeService {
    private serveProcess;
    private currentPort;
    private isStarting;
    private tailscaleExecutable;
    private lastError;
    private startTime;
    start(port: number): Promise<void>;
    stop(): Promise<void>;
    isRunning(): boolean;
    getStatus(): Promise<TailscaleServeStatus>;
    private cleanup;
    private checkTailscaleAvailable;
}
export declare const tailscaleServeService: TailscaleServeServiceImpl;
