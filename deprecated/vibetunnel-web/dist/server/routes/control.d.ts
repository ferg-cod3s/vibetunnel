/**
 * Control Event Stream Route
 *
 * Provides a server-sent event stream for real-time control messages
 * including Git notifications and system events.
 */
import { EventEmitter } from 'events';
import { Router } from 'express';
export declare const controlEventEmitter: EventEmitter<[never]>;
export interface ControlEvent {
    category: string;
    action: string;
    data?: unknown;
}
export declare function createControlRoutes(): Router;
