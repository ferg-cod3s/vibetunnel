export declare class MDNSService {
    private bonjour;
    private service;
    private isAdvertising;
    /**
     * Start advertising the VibeTunnel service via mDNS/Bonjour
     */
    startAdvertising(port: number, instanceName?: string): Promise<void>;
    /**
     * Stop advertising the service
     */
    stopAdvertising(): Promise<void>;
    /**
     * Check if the service is currently advertising
     */
    isActive(): boolean;
}
export declare const mdnsService: MDNSService;
