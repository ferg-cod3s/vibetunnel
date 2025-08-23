/**
 * Global shutdown state management for the server.
 * This module tracks whether the server is currently shutting down
 * to allow various components to handle shutdown gracefully.
 */
export declare function isShuttingDown(): boolean;
export declare function setShuttingDown(value: boolean): void;
