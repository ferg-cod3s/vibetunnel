import { Router } from 'express';
import type { AuthService } from '../services/auth-service.js';
interface AuthRoutesConfig {
    authService: AuthService;
    enableSSHKeys?: boolean;
    disallowUserPassword?: boolean;
    noAuth?: boolean;
}
export declare function createAuthRoutes(config: AuthRoutesConfig): Router;
export {};
