interface AuthResult {
    success: boolean;
    userId?: string;
    token?: string;
    error?: string;
}
interface SSHKeyAuth {
    publicKey: string;
    signature: string;
    challengeId: string;
}
export declare class AuthService {
    private challenges;
    private jwtSecret;
    private challengeTimeout;
    constructor();
    private generateSecret;
    private cleanupExpiredChallenges;
    /**
     * Authenticate user with SSH key (priority method)
     */
    authenticateWithSSHKey(sshKeyAuth: SSHKeyAuth): Promise<AuthResult>;
    /**
     * Authenticate user with PAM (fallback method)
     */
    authenticateWithPassword(userId: string, password: string): Promise<AuthResult>;
    /**
     * Create authentication challenge for SSH key auth
     */
    createChallenge(userId: string): {
        challengeId: string;
        challenge: string;
    };
    /**
     * Verify JWT token
     */
    verifyToken(token: string): {
        valid: boolean;
        userId?: string;
    };
    /**
     * Generate JWT token
     */
    private generateToken;
    /**
     * Verify credentials using PAM
     */
    private verifyPAMCredentials;
    /**
     * Verify SSH signature
     */
    private verifySSHSignature;
    /**
     * Check if SSH key is authorized for user
     */
    private checkSSHKeyAuthorization;
    /**
     * Get current system user
     */
    getCurrentUser(): string;
    /**
     * Check if user exists on system
     */
    userExists(userId: string): Promise<boolean>;
}
export {};
