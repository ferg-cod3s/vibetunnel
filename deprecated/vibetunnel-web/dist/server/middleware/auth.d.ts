import type { NextFunction, Request, Response } from 'express';
import type { AuthService } from '../services/auth-service.js';
interface AuthConfig {
    enableSSHKeys: boolean;
    disallowUserPassword: boolean;
    noAuth: boolean;
    isHQMode: boolean;
    bearerToken?: string;
    authService?: AuthService;
    allowLocalBypass?: boolean;
    localAuthToken?: string;
    allowTailscaleAuth?: boolean;
}
export interface AuthenticatedRequest extends Request {
    userId?: string;
    authMethod?: 'ssh-key' | 'password' | 'hq-bearer' | 'no-auth' | 'local-bypass' | 'tailscale';
    isHQRequest?: boolean;
    tailscaleUser?: TailscaleUser;
}
export interface TailscaleUser {
    login: string;
    name: string;
    profilePic?: string;
}
export declare function createAuthMiddleware(config: AuthConfig): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export {};
