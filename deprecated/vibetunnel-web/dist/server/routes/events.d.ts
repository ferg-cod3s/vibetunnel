import { Router } from 'express';
import type { SessionMonitor } from '../services/session-monitor.js';
/**
 * Server-Sent Events (SSE) endpoint for real-time event streaming
 */
export declare function createEventsRouter(sessionMonitor?: SessionMonitor): Router;
