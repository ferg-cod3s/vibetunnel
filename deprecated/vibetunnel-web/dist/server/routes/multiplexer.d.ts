import { Router } from 'express';
import type { PtyManager } from '../pty/pty-manager.js';
export declare function createMultiplexerRoutes(options: {
    ptyManager: PtyManager;
}): Router;
