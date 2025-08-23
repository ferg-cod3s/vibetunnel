import { Router } from 'express';
import type { RemoteRegistry } from '../services/remote-registry.js';
interface RemoteRoutesConfig {
    remoteRegistry: RemoteRegistry | null;
    isHQMode: boolean;
}
export declare function createRemoteRoutes(config: RemoteRoutesConfig): Router;
export {};
