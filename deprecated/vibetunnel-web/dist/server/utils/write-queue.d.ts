/**
 * Simple queue for serializing async write operations
 */
export declare class WriteQueue {
    private queue;
    enqueue(writeFn: () => Promise<void> | void): void;
    /**
     * Wait for all queued operations to complete
     */
    drain(): Promise<void>;
}
