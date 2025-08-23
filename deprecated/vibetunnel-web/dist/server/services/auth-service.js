"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const crypto = __importStar(require("crypto"));
const jwt = __importStar(require("jsonwebtoken"));
const authenticate_pam_loader_js_1 = require("./authenticate-pam-loader.js");
class AuthService {
    constructor() {
        this.challenges = new Map();
        this.challengeTimeout = 5 * 60 * 1000; // 5 minutes
        // Generate or load JWT secret
        this.jwtSecret = process.env.JWT_SECRET || this.generateSecret();
        // Clean up expired challenges every minute
        setInterval(() => this.cleanupExpiredChallenges(), 60000);
    }
    generateSecret() {
        return crypto.randomBytes(64).toString('hex');
    }
    cleanupExpiredChallenges() {
        const now = Date.now();
        for (const [id, challenge] of this.challenges.entries()) {
            if (now - challenge.timestamp > this.challengeTimeout) {
                this.challenges.delete(id);
            }
        }
    }
    /**
     * Authenticate user with SSH key (priority method)
     */
    async authenticateWithSSHKey(sshKeyAuth) {
        try {
            const challenge = this.challenges.get(sshKeyAuth.challengeId);
            if (!challenge) {
                return { success: false, error: 'Invalid or expired challenge' };
            }
            // Verify the signature using the original public key string
            const signatureBuffer = Buffer.from(sshKeyAuth.signature, 'base64');
            const isValidSignature = this.verifySSHSignature(challenge.challenge, signatureBuffer, sshKeyAuth.publicKey);
            if (!isValidSignature) {
                return { success: false, error: 'Invalid SSH key signature' };
            }
            // Check if this key is authorized for the user
            const isAuthorized = await this.checkSSHKeyAuthorization(challenge.userId, sshKeyAuth.publicKey);
            if (!isAuthorized) {
                return { success: false, error: 'SSH key not authorized for this user' };
            }
            // Clean up challenge
            this.challenges.delete(sshKeyAuth.challengeId);
            // Generate JWT token
            const token = this.generateToken(challenge.userId);
            return {
                success: true,
                userId: challenge.userId,
                token,
            };
        }
        catch (error) {
            console.error('SSH key authentication error:', error);
            return { success: false, error: 'SSH key authentication failed' };
        }
    }
    /**
     * Authenticate user with PAM (fallback method)
     */
    async authenticateWithPassword(userId, password) {
        try {
            // Check environment variables first (for testing and simple deployments)
            const envUsername = process.env.VIBETUNNEL_USERNAME;
            const envPassword = process.env.VIBETUNNEL_PASSWORD;
            if (envUsername && envPassword) {
                // Use environment variable authentication
                if (userId === envUsername && password === envPassword) {
                    const token = this.generateToken(userId);
                    return {
                        success: true,
                        userId,
                        token,
                    };
                }
                else {
                    return { success: false, error: 'Invalid username or password' };
                }
            }
            // Fall back to PAM authentication
            const isValid = await this.verifyPAMCredentials(userId, password);
            if (!isValid) {
                return { success: false, error: 'Invalid username or password' };
            }
            const token = this.generateToken(userId);
            return {
                success: true,
                userId,
                token,
            };
        }
        catch (error) {
            console.error('PAM authentication error:', error);
            return { success: false, error: 'Authentication failed' };
        }
    }
    /**
     * Create authentication challenge for SSH key auth
     */
    createChallenge(userId) {
        const challengeId = crypto.randomUUID();
        const challenge = crypto.randomBytes(32);
        this.challenges.set(challengeId, {
            challengeId,
            challenge,
            timestamp: Date.now(),
            userId,
        });
        return {
            challengeId,
            challenge: challenge.toString('base64'),
        };
    }
    /**
     * Verify JWT token
     */
    verifyToken(token) {
        try {
            const payload = jwt.verify(token, this.jwtSecret);
            return { valid: true, userId: payload.userId };
        }
        catch (_error) {
            return { valid: false };
        }
    }
    /**
     * Generate JWT token
     */
    generateToken(userId) {
        return jwt.sign({ userId, iat: Math.floor(Date.now() / 1000) }, this.jwtSecret, {
            expiresIn: '24h',
        });
    }
    /**
     * Verify credentials using PAM
     */
    async verifyPAMCredentials(username, password) {
        return new Promise((resolve) => {
            (0, authenticate_pam_loader_js_1.authenticate)(username, password, (err) => {
                if (err) {
                    console.error('PAM authentication failed:', err.message);
                    resolve(false);
                }
                else {
                    resolve(true);
                }
            });
        });
    }
    /**
     * Verify SSH signature
     */
    verifySSHSignature(challenge, signature, publicKeyStr) {
        try {
            // Basic sanity checks
            if (!challenge || !signature || !publicKeyStr) {
                console.error('Missing required parameters for signature verification');
                return false;
            }
            const keyParts = publicKeyStr.trim().split(' ');
            if (keyParts.length < 2) {
                console.error('Invalid SSH public key format');
                return false;
            }
            const keyType = keyParts[0];
            const keyData = keyParts[1];
            if (keyType === 'ssh-ed25519') {
                // Check signature length
                if (signature.length !== 64) {
                    console.error(`Invalid Ed25519 signature length: ${signature.length} (expected 64)`);
                    return false;
                }
                // Decode the SSH public key
                const sshKeyBuffer = Buffer.from(keyData, 'base64');
                // Parse SSH wire format: length + "ssh-ed25519" + length + 32-byte key
                let offset = 0;
                // Skip algorithm name length and value
                const algLength = sshKeyBuffer.readUInt32BE(offset);
                offset += 4 + algLength;
                // Read public key length and value
                const keyLength = sshKeyBuffer.readUInt32BE(offset);
                offset += 4;
                if (keyLength !== 32) {
                    console.error(`Invalid Ed25519 key length: ${keyLength} (expected 32)`);
                    return false;
                }
                const rawPublicKey = sshKeyBuffer.subarray(offset, offset + 32);
                // Create a Node.js public key object
                const publicKey = crypto.createPublicKey({
                    key: Buffer.concat([
                        Buffer.from([0x30, 0x2a]), // DER sequence header
                        Buffer.from([0x30, 0x05]), // Algorithm identifier sequence
                        Buffer.from([0x06, 0x03, 0x2b, 0x65, 0x70]), // Ed25519 OID
                        Buffer.from([0x03, 0x21, 0x00]), // Public key bit string
                        rawPublicKey,
                    ]),
                    format: 'der',
                    type: 'spki',
                });
                // Verify the signature
                const isValid = crypto.verify(null, challenge, publicKey, signature);
                console.log(`🔐 Ed25519 signature verification: ${isValid ? 'PASSED' : 'FAILED'}`);
                return isValid;
            }
            console.error(`Unsupported key type: ${keyType}`);
            return false;
        }
        catch (error) {
            console.error('SSH signature verification failed:', error);
            return false;
        }
    }
    /**
     * Check if SSH key is authorized for user
     */
    async checkSSHKeyAuthorization(userId, publicKey) {
        try {
            const os = require('os');
            const fs = require('fs');
            const path = require('path');
            // Check user's authorized_keys file
            const homeDir = userId === process.env.USER ? os.homedir() : `/home/${userId}`;
            const authorizedKeysPath = path.join(homeDir, '.ssh', 'authorized_keys');
            if (!fs.existsSync(authorizedKeysPath)) {
                return false;
            }
            const authorizedKeys = fs.readFileSync(authorizedKeysPath, 'utf8');
            const keyParts = publicKey.trim().split(' ');
            const keyData = keyParts.length > 1 ? keyParts[1] : keyParts[0];
            // Check if the key exists in authorized_keys
            return authorizedKeys.includes(keyData);
        }
        catch (error) {
            console.error('Error checking SSH key authorization:', error);
            return false;
        }
    }
    /**
     * Get current system user
     */
    getCurrentUser() {
        return process.env.USER || process.env.USERNAME || 'unknown';
    }
    /**
     * Check if user exists on system
     */
    async userExists(userId) {
        try {
            const { spawnSync } = require('child_process');
            const result = spawnSync('id', [userId], { stdio: 'ignore' });
            return result.status === 0;
        }
        catch (_error) {
            return false;
        }
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC1zZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci9zZXJ2aWNlcy9hdXRoLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsK0NBQWlDO0FBQ2pDLGtEQUFvQztBQUNwQyw2RUFBK0U7QUFzQi9FLE1BQWEsV0FBVztJQUt0QjtRQUpRLGVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBeUIsQ0FBQztRQUU5QyxxQkFBZ0IsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDLFlBQVk7UUFHcEQsOEJBQThCO1FBQzlCLElBQUksQ0FBQyxTQUFTLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBRWpFLDJDQUEyQztRQUMzQyxXQUFXLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDNUQsQ0FBQztJQUVPLGNBQWM7UUFDcEIsT0FBTyxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRU8sd0JBQXdCO1FBQzlCLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN2QixLQUFLLE1BQU0sQ0FBQyxFQUFFLEVBQUUsU0FBUyxDQUFDLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDO1lBQ3hELElBQUksR0FBRyxHQUFHLFNBQVMsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7Z0JBQ3RELElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQzdCLENBQUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLHNCQUFzQixDQUFDLFVBQXNCO1FBQ2pELElBQUksQ0FBQztZQUNILE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUM5RCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ2YsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLDhCQUE4QixFQUFFLENBQUM7WUFDbkUsQ0FBQztZQUVELDREQUE0RDtZQUM1RCxNQUFNLGVBQWUsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDcEUsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQzlDLFNBQVMsQ0FBQyxTQUFTLEVBQ25CLGVBQWUsRUFDZixVQUFVLENBQUMsU0FBUyxDQUNyQixDQUFDO1lBRUYsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7Z0JBQ3RCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSwyQkFBMkIsRUFBRSxDQUFDO1lBQ2hFLENBQUM7WUFFRCwrQ0FBK0M7WUFDL0MsTUFBTSxZQUFZLEdBQUcsTUFBTSxJQUFJLENBQUMsd0JBQXdCLENBQ3RELFNBQVMsQ0FBQyxNQUFNLEVBQ2hCLFVBQVUsQ0FBQyxTQUFTLENBQ3JCLENBQUM7WUFDRixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ2xCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxzQ0FBc0MsRUFBRSxDQUFDO1lBQzNFLENBQUM7WUFFRCxxQkFBcUI7WUFDckIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBRS9DLHFCQUFxQjtZQUNyQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUVuRCxPQUFPO2dCQUNMLE9BQU8sRUFBRSxJQUFJO2dCQUNiLE1BQU0sRUFBRSxTQUFTLENBQUMsTUFBTTtnQkFDeEIsS0FBSzthQUNOLENBQUM7UUFDSixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDdEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLCtCQUErQixFQUFFLENBQUM7UUFDcEUsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxNQUFjLEVBQUUsUUFBZ0I7UUFDN0QsSUFBSSxDQUFDO1lBQ0gseUVBQXlFO1lBQ3pFLE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUM7WUFDcEQsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztZQUVwRCxJQUFJLFdBQVcsSUFBSSxXQUFXLEVBQUUsQ0FBQztnQkFDL0IsMENBQTBDO2dCQUMxQyxJQUFJLE1BQU0sS0FBSyxXQUFXLElBQUksUUFBUSxLQUFLLFdBQVcsRUFBRSxDQUFDO29CQUN2RCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUN6QyxPQUFPO3dCQUNMLE9BQU8sRUFBRSxJQUFJO3dCQUNiLE1BQU07d0JBQ04sS0FBSztxQkFDTixDQUFDO2dCQUNKLENBQUM7cUJBQU0sQ0FBQztvQkFDTixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsOEJBQThCLEVBQUUsQ0FBQztnQkFDbkUsQ0FBQztZQUNILENBQUM7WUFFRCxrQ0FBa0M7WUFDbEMsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ2xFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDYixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsOEJBQThCLEVBQUUsQ0FBQztZQUNuRSxDQUFDO1lBRUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUV6QyxPQUFPO2dCQUNMLE9BQU8sRUFBRSxJQUFJO2dCQUNiLE1BQU07Z0JBQ04sS0FBSzthQUNOLENBQUM7UUFDSixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMkJBQTJCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDbEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUM7UUFDNUQsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILGVBQWUsQ0FBQyxNQUFjO1FBQzVCLE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUN4QyxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRXpDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRTtZQUMvQixXQUFXO1lBQ1gsU0FBUztZQUNULFNBQVMsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFO1lBQ3JCLE1BQU07U0FDUCxDQUFDLENBQUM7UUFFSCxPQUFPO1lBQ0wsV0FBVztZQUNYLFNBQVMsRUFBRSxTQUFTLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztTQUN4QyxDQUFDO0lBQ0osQ0FBQztJQUVEOztPQUVHO0lBQ0gsV0FBVyxDQUFDLEtBQWE7UUFDdkIsSUFBSSxDQUFDO1lBQ0gsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBd0MsQ0FBQztZQUN6RixPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2pELENBQUM7UUFBQyxPQUFPLE1BQU0sRUFBRSxDQUFDO1lBQ2hCLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUM7UUFDMUIsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNLLGFBQWEsQ0FBQyxNQUFjO1FBQ2xDLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsU0FBUyxFQUFFO1lBQzlFLFNBQVMsRUFBRSxLQUFLO1NBQ2pCLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNLLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxRQUFnQixFQUFFLFFBQWdCO1FBQ25FLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtZQUM3QixJQUFBLHlDQUFlLEVBQUMsUUFBUSxFQUFFLFFBQVEsRUFBRSxDQUFDLEdBQWlCLEVBQUUsRUFBRTtnQkFDeEQsSUFBSSxHQUFHLEVBQUUsQ0FBQztvQkFDUixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFDekQsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNqQixDQUFDO3FCQUFNLENBQUM7b0JBQ04sT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNoQixDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNLLGtCQUFrQixDQUFDLFNBQWlCLEVBQUUsU0FBaUIsRUFBRSxZQUFvQjtRQUNuRixJQUFJLENBQUM7WUFDSCxzQkFBc0I7WUFDdEIsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUM5QyxPQUFPLENBQUMsS0FBSyxDQUFDLHdEQUF3RCxDQUFDLENBQUM7Z0JBQ3hFLE9BQU8sS0FBSyxDQUFDO1lBQ2YsQ0FBQztZQUVELE1BQU0sUUFBUSxHQUFHLFlBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDaEQsSUFBSSxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN4QixPQUFPLENBQUMsS0FBSyxDQUFDLCtCQUErQixDQUFDLENBQUM7Z0JBQy9DLE9BQU8sS0FBSyxDQUFDO1lBQ2YsQ0FBQztZQUVELE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1QixNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFNUIsSUFBSSxPQUFPLEtBQUssYUFBYSxFQUFFLENBQUM7Z0JBQzlCLHlCQUF5QjtnQkFDekIsSUFBSSxTQUFTLENBQUMsTUFBTSxLQUFLLEVBQUUsRUFBRSxDQUFDO29CQUM1QixPQUFPLENBQUMsS0FBSyxDQUFDLHFDQUFxQyxTQUFTLENBQUMsTUFBTSxnQkFBZ0IsQ0FBQyxDQUFDO29CQUNyRixPQUFPLEtBQUssQ0FBQztnQkFDZixDQUFDO2dCQUVELDRCQUE0QjtnQkFDNUIsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBRXBELHVFQUF1RTtnQkFDdkUsSUFBSSxNQUFNLEdBQUcsQ0FBQyxDQUFDO2dCQUVmLHVDQUF1QztnQkFDdkMsTUFBTSxTQUFTLEdBQUcsWUFBWSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDcEQsTUFBTSxJQUFJLENBQUMsR0FBRyxTQUFTLENBQUM7Z0JBRXhCLG1DQUFtQztnQkFDbkMsTUFBTSxTQUFTLEdBQUcsWUFBWSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDcEQsTUFBTSxJQUFJLENBQUMsQ0FBQztnQkFFWixJQUFJLFNBQVMsS0FBSyxFQUFFLEVBQUUsQ0FBQztvQkFDckIsT0FBTyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsU0FBUyxnQkFBZ0IsQ0FBQyxDQUFDO29CQUN4RSxPQUFPLEtBQUssQ0FBQztnQkFDZixDQUFDO2dCQUVELE1BQU0sWUFBWSxHQUFHLFlBQVksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLE1BQU0sR0FBRyxFQUFFLENBQUMsQ0FBQztnQkFFaEUscUNBQXFDO2dCQUNyQyxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsZUFBZSxDQUFDO29CQUN2QyxHQUFHLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQzt3QkFDakIsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLHNCQUFzQjt3QkFDakQsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLGdDQUFnQzt3QkFDM0QsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLGNBQWM7d0JBQzNELE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUUsd0JBQXdCO3dCQUN6RCxZQUFZO3FCQUNiLENBQUM7b0JBQ0YsTUFBTSxFQUFFLEtBQUs7b0JBQ2IsSUFBSSxFQUFFLE1BQU07aUJBQ2IsQ0FBQyxDQUFDO2dCQUVILHVCQUF1QjtnQkFDdkIsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDckUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQ0FBc0MsT0FBTyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0JBQ25GLE9BQU8sT0FBTyxDQUFDO1lBQ2pCLENBQUM7WUFFRCxPQUFPLENBQUMsS0FBSyxDQUFDLHlCQUF5QixPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ2xELE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzNELE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNLLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxNQUFjLEVBQUUsU0FBaUI7UUFDdEUsSUFBSSxDQUFDO1lBQ0gsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3pCLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN6QixNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFN0Isb0NBQW9DO1lBQ3BDLE1BQU0sT0FBTyxHQUFHLE1BQU0sS0FBSyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLE1BQU0sRUFBRSxDQUFDO1lBQy9FLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLGlCQUFpQixDQUFDLENBQUM7WUFFekUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDO2dCQUN2QyxPQUFPLEtBQUssQ0FBQztZQUNmLENBQUM7WUFFRCxNQUFNLGNBQWMsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLGtCQUFrQixFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ25FLE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDN0MsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRWhFLDZDQUE2QztZQUM3QyxPQUFPLGNBQWMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDMUMsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLHVDQUF1QyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzlELE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILGNBQWM7UUFDWixPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxJQUFJLFNBQVMsQ0FBQztJQUMvRCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsVUFBVSxDQUFDLE1BQWM7UUFDN0IsSUFBSSxDQUFDO1lBQ0gsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUMvQyxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUM5RCxPQUFPLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDO1FBQzdCLENBQUM7UUFBQyxPQUFPLE1BQU0sRUFBRSxDQUFDO1lBQ2hCLE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztJQUNILENBQUM7Q0FDRjtBQXhTRCxrQ0F3U0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjcnlwdG8gZnJvbSAnY3J5cHRvJztcbmltcG9ydCAqIGFzIGp3dCBmcm9tICdqc29ud2VidG9rZW4nO1xuaW1wb3J0IHsgYXV0aGVudGljYXRlIGFzIHBhbUF1dGhlbnRpY2F0ZSB9IGZyb20gJy4vYXV0aGVudGljYXRlLXBhbS1sb2FkZXIuanMnO1xuXG5pbnRlcmZhY2UgQXV0aENoYWxsZW5nZSB7XG4gIGNoYWxsZW5nZUlkOiBzdHJpbmc7XG4gIGNoYWxsZW5nZTogQnVmZmVyO1xuICB0aW1lc3RhbXA6IG51bWJlcjtcbiAgdXNlcklkOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBBdXRoUmVzdWx0IHtcbiAgc3VjY2VzczogYm9vbGVhbjtcbiAgdXNlcklkPzogc3RyaW5nO1xuICB0b2tlbj86IHN0cmluZztcbiAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBTU0hLZXlBdXRoIHtcbiAgcHVibGljS2V5OiBzdHJpbmc7XG4gIHNpZ25hdHVyZTogc3RyaW5nO1xuICBjaGFsbGVuZ2VJZDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgQXV0aFNlcnZpY2Uge1xuICBwcml2YXRlIGNoYWxsZW5nZXMgPSBuZXcgTWFwPHN0cmluZywgQXV0aENoYWxsZW5nZT4oKTtcbiAgcHJpdmF0ZSBqd3RTZWNyZXQ6IHN0cmluZztcbiAgcHJpdmF0ZSBjaGFsbGVuZ2VUaW1lb3V0ID0gNSAqIDYwICogMTAwMDsgLy8gNSBtaW51dGVzXG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgLy8gR2VuZXJhdGUgb3IgbG9hZCBKV1Qgc2VjcmV0XG4gICAgdGhpcy5qd3RTZWNyZXQgPSBwcm9jZXNzLmVudi5KV1RfU0VDUkVUIHx8IHRoaXMuZ2VuZXJhdGVTZWNyZXQoKTtcblxuICAgIC8vIENsZWFuIHVwIGV4cGlyZWQgY2hhbGxlbmdlcyBldmVyeSBtaW51dGVcbiAgICBzZXRJbnRlcnZhbCgoKSA9PiB0aGlzLmNsZWFudXBFeHBpcmVkQ2hhbGxlbmdlcygpLCA2MDAwMCk7XG4gIH1cblxuICBwcml2YXRlIGdlbmVyYXRlU2VjcmV0KCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGNyeXB0by5yYW5kb21CeXRlcyg2NCkudG9TdHJpbmcoJ2hleCcpO1xuICB9XG5cbiAgcHJpdmF0ZSBjbGVhbnVwRXhwaXJlZENoYWxsZW5nZXMoKTogdm9pZCB7XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICBmb3IgKGNvbnN0IFtpZCwgY2hhbGxlbmdlXSBvZiB0aGlzLmNoYWxsZW5nZXMuZW50cmllcygpKSB7XG4gICAgICBpZiAobm93IC0gY2hhbGxlbmdlLnRpbWVzdGFtcCA+IHRoaXMuY2hhbGxlbmdlVGltZW91dCkge1xuICAgICAgICB0aGlzLmNoYWxsZW5nZXMuZGVsZXRlKGlkKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQXV0aGVudGljYXRlIHVzZXIgd2l0aCBTU0gga2V5IChwcmlvcml0eSBtZXRob2QpXG4gICAqL1xuICBhc3luYyBhdXRoZW50aWNhdGVXaXRoU1NIS2V5KHNzaEtleUF1dGg6IFNTSEtleUF1dGgpOiBQcm9taXNlPEF1dGhSZXN1bHQ+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgY2hhbGxlbmdlID0gdGhpcy5jaGFsbGVuZ2VzLmdldChzc2hLZXlBdXRoLmNoYWxsZW5nZUlkKTtcbiAgICAgIGlmICghY2hhbGxlbmdlKSB7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0ludmFsaWQgb3IgZXhwaXJlZCBjaGFsbGVuZ2UnIH07XG4gICAgICB9XG5cbiAgICAgIC8vIFZlcmlmeSB0aGUgc2lnbmF0dXJlIHVzaW5nIHRoZSBvcmlnaW5hbCBwdWJsaWMga2V5IHN0cmluZ1xuICAgICAgY29uc3Qgc2lnbmF0dXJlQnVmZmVyID0gQnVmZmVyLmZyb20oc3NoS2V5QXV0aC5zaWduYXR1cmUsICdiYXNlNjQnKTtcbiAgICAgIGNvbnN0IGlzVmFsaWRTaWduYXR1cmUgPSB0aGlzLnZlcmlmeVNTSFNpZ25hdHVyZShcbiAgICAgICAgY2hhbGxlbmdlLmNoYWxsZW5nZSxcbiAgICAgICAgc2lnbmF0dXJlQnVmZmVyLFxuICAgICAgICBzc2hLZXlBdXRoLnB1YmxpY0tleVxuICAgICAgKTtcblxuICAgICAgaWYgKCFpc1ZhbGlkU2lnbmF0dXJlKSB7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0ludmFsaWQgU1NIIGtleSBzaWduYXR1cmUnIH07XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIGlmIHRoaXMga2V5IGlzIGF1dGhvcml6ZWQgZm9yIHRoZSB1c2VyXG4gICAgICBjb25zdCBpc0F1dGhvcml6ZWQgPSBhd2FpdCB0aGlzLmNoZWNrU1NIS2V5QXV0aG9yaXphdGlvbihcbiAgICAgICAgY2hhbGxlbmdlLnVzZXJJZCxcbiAgICAgICAgc3NoS2V5QXV0aC5wdWJsaWNLZXlcbiAgICAgICk7XG4gICAgICBpZiAoIWlzQXV0aG9yaXplZCkge1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdTU0gga2V5IG5vdCBhdXRob3JpemVkIGZvciB0aGlzIHVzZXInIH07XG4gICAgICB9XG5cbiAgICAgIC8vIENsZWFuIHVwIGNoYWxsZW5nZVxuICAgICAgdGhpcy5jaGFsbGVuZ2VzLmRlbGV0ZShzc2hLZXlBdXRoLmNoYWxsZW5nZUlkKTtcblxuICAgICAgLy8gR2VuZXJhdGUgSldUIHRva2VuXG4gICAgICBjb25zdCB0b2tlbiA9IHRoaXMuZ2VuZXJhdGVUb2tlbihjaGFsbGVuZ2UudXNlcklkKTtcblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgdXNlcklkOiBjaGFsbGVuZ2UudXNlcklkLFxuICAgICAgICB0b2tlbixcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ1NTSCBrZXkgYXV0aGVudGljYXRpb24gZXJyb3I6JywgZXJyb3IpO1xuICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnU1NIIGtleSBhdXRoZW50aWNhdGlvbiBmYWlsZWQnIH07XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEF1dGhlbnRpY2F0ZSB1c2VyIHdpdGggUEFNIChmYWxsYmFjayBtZXRob2QpXG4gICAqL1xuICBhc3luYyBhdXRoZW50aWNhdGVXaXRoUGFzc3dvcmQodXNlcklkOiBzdHJpbmcsIHBhc3N3b3JkOiBzdHJpbmcpOiBQcm9taXNlPEF1dGhSZXN1bHQ+IHtcbiAgICB0cnkge1xuICAgICAgLy8gQ2hlY2sgZW52aXJvbm1lbnQgdmFyaWFibGVzIGZpcnN0IChmb3IgdGVzdGluZyBhbmQgc2ltcGxlIGRlcGxveW1lbnRzKVxuICAgICAgY29uc3QgZW52VXNlcm5hbWUgPSBwcm9jZXNzLmVudi5WSUJFVFVOTkVMX1VTRVJOQU1FO1xuICAgICAgY29uc3QgZW52UGFzc3dvcmQgPSBwcm9jZXNzLmVudi5WSUJFVFVOTkVMX1BBU1NXT1JEO1xuXG4gICAgICBpZiAoZW52VXNlcm5hbWUgJiYgZW52UGFzc3dvcmQpIHtcbiAgICAgICAgLy8gVXNlIGVudmlyb25tZW50IHZhcmlhYmxlIGF1dGhlbnRpY2F0aW9uXG4gICAgICAgIGlmICh1c2VySWQgPT09IGVudlVzZXJuYW1lICYmIHBhc3N3b3JkID09PSBlbnZQYXNzd29yZCkge1xuICAgICAgICAgIGNvbnN0IHRva2VuID0gdGhpcy5nZW5lcmF0ZVRva2VuKHVzZXJJZCk7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgICB0b2tlbixcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0ludmFsaWQgdXNlcm5hbWUgb3IgcGFzc3dvcmQnIH07XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gRmFsbCBiYWNrIHRvIFBBTSBhdXRoZW50aWNhdGlvblxuICAgICAgY29uc3QgaXNWYWxpZCA9IGF3YWl0IHRoaXMudmVyaWZ5UEFNQ3JlZGVudGlhbHModXNlcklkLCBwYXNzd29yZCk7XG4gICAgICBpZiAoIWlzVmFsaWQpIHtcbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnSW52YWxpZCB1c2VybmFtZSBvciBwYXNzd29yZCcgfTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdG9rZW4gPSB0aGlzLmdlbmVyYXRlVG9rZW4odXNlcklkKTtcblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgdXNlcklkLFxuICAgICAgICB0b2tlbixcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ1BBTSBhdXRoZW50aWNhdGlvbiBlcnJvcjonLCBlcnJvcik7XG4gICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdBdXRoZW50aWNhdGlvbiBmYWlsZWQnIH07XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhdXRoZW50aWNhdGlvbiBjaGFsbGVuZ2UgZm9yIFNTSCBrZXkgYXV0aFxuICAgKi9cbiAgY3JlYXRlQ2hhbGxlbmdlKHVzZXJJZDogc3RyaW5nKTogeyBjaGFsbGVuZ2VJZDogc3RyaW5nOyBjaGFsbGVuZ2U6IHN0cmluZyB9IHtcbiAgICBjb25zdCBjaGFsbGVuZ2VJZCA9IGNyeXB0by5yYW5kb21VVUlEKCk7XG4gICAgY29uc3QgY2hhbGxlbmdlID0gY3J5cHRvLnJhbmRvbUJ5dGVzKDMyKTtcblxuICAgIHRoaXMuY2hhbGxlbmdlcy5zZXQoY2hhbGxlbmdlSWQsIHtcbiAgICAgIGNoYWxsZW5nZUlkLFxuICAgICAgY2hhbGxlbmdlLFxuICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgdXNlcklkLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNoYWxsZW5nZUlkLFxuICAgICAgY2hhbGxlbmdlOiBjaGFsbGVuZ2UudG9TdHJpbmcoJ2Jhc2U2NCcpLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogVmVyaWZ5IEpXVCB0b2tlblxuICAgKi9cbiAgdmVyaWZ5VG9rZW4odG9rZW46IHN0cmluZyk6IHsgdmFsaWQ6IGJvb2xlYW47IHVzZXJJZD86IHN0cmluZyB9IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGF5bG9hZCA9IGp3dC52ZXJpZnkodG9rZW4sIHRoaXMuand0U2VjcmV0KSBhcyBqd3QuSnd0UGF5bG9hZCAmIHsgdXNlcklkOiBzdHJpbmcgfTtcbiAgICAgIHJldHVybiB7IHZhbGlkOiB0cnVlLCB1c2VySWQ6IHBheWxvYWQudXNlcklkIH07XG4gICAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgICByZXR1cm4geyB2YWxpZDogZmFsc2UgfTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogR2VuZXJhdGUgSldUIHRva2VuXG4gICAqL1xuICBwcml2YXRlIGdlbmVyYXRlVG9rZW4odXNlcklkOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBqd3Quc2lnbih7IHVzZXJJZCwgaWF0OiBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKSB9LCB0aGlzLmp3dFNlY3JldCwge1xuICAgICAgZXhwaXJlc0luOiAnMjRoJyxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBWZXJpZnkgY3JlZGVudGlhbHMgdXNpbmcgUEFNXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIHZlcmlmeVBBTUNyZWRlbnRpYWxzKHVzZXJuYW1lOiBzdHJpbmcsIHBhc3N3b3JkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIHBhbUF1dGhlbnRpY2F0ZSh1c2VybmFtZSwgcGFzc3dvcmQsIChlcnI6IEVycm9yIHwgbnVsbCkgPT4ge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcignUEFNIGF1dGhlbnRpY2F0aW9uIGZhaWxlZDonLCBlcnIubWVzc2FnZSk7XG4gICAgICAgICAgcmVzb2x2ZShmYWxzZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogVmVyaWZ5IFNTSCBzaWduYXR1cmVcbiAgICovXG4gIHByaXZhdGUgdmVyaWZ5U1NIU2lnbmF0dXJlKGNoYWxsZW5nZTogQnVmZmVyLCBzaWduYXR1cmU6IEJ1ZmZlciwgcHVibGljS2V5U3RyOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICB0cnkge1xuICAgICAgLy8gQmFzaWMgc2FuaXR5IGNoZWNrc1xuICAgICAgaWYgKCFjaGFsbGVuZ2UgfHwgIXNpZ25hdHVyZSB8fCAhcHVibGljS2V5U3RyKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ01pc3NpbmcgcmVxdWlyZWQgcGFyYW1ldGVycyBmb3Igc2lnbmF0dXJlIHZlcmlmaWNhdGlvbicpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGtleVBhcnRzID0gcHVibGljS2V5U3RyLnRyaW0oKS5zcGxpdCgnICcpO1xuICAgICAgaWYgKGtleVBhcnRzLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignSW52YWxpZCBTU0ggcHVibGljIGtleSBmb3JtYXQnKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBrZXlUeXBlID0ga2V5UGFydHNbMF07XG4gICAgICBjb25zdCBrZXlEYXRhID0ga2V5UGFydHNbMV07XG5cbiAgICAgIGlmIChrZXlUeXBlID09PSAnc3NoLWVkMjU1MTknKSB7XG4gICAgICAgIC8vIENoZWNrIHNpZ25hdHVyZSBsZW5ndGhcbiAgICAgICAgaWYgKHNpZ25hdHVyZS5sZW5ndGggIT09IDY0KSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgSW52YWxpZCBFZDI1NTE5IHNpZ25hdHVyZSBsZW5ndGg6ICR7c2lnbmF0dXJlLmxlbmd0aH0gKGV4cGVjdGVkIDY0KWApO1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERlY29kZSB0aGUgU1NIIHB1YmxpYyBrZXlcbiAgICAgICAgY29uc3Qgc3NoS2V5QnVmZmVyID0gQnVmZmVyLmZyb20oa2V5RGF0YSwgJ2Jhc2U2NCcpO1xuXG4gICAgICAgIC8vIFBhcnNlIFNTSCB3aXJlIGZvcm1hdDogbGVuZ3RoICsgXCJzc2gtZWQyNTUxOVwiICsgbGVuZ3RoICsgMzItYnl0ZSBrZXlcbiAgICAgICAgbGV0IG9mZnNldCA9IDA7XG5cbiAgICAgICAgLy8gU2tpcCBhbGdvcml0aG0gbmFtZSBsZW5ndGggYW5kIHZhbHVlXG4gICAgICAgIGNvbnN0IGFsZ0xlbmd0aCA9IHNzaEtleUJ1ZmZlci5yZWFkVUludDMyQkUob2Zmc2V0KTtcbiAgICAgICAgb2Zmc2V0ICs9IDQgKyBhbGdMZW5ndGg7XG5cbiAgICAgICAgLy8gUmVhZCBwdWJsaWMga2V5IGxlbmd0aCBhbmQgdmFsdWVcbiAgICAgICAgY29uc3Qga2V5TGVuZ3RoID0gc3NoS2V5QnVmZmVyLnJlYWRVSW50MzJCRShvZmZzZXQpO1xuICAgICAgICBvZmZzZXQgKz0gNDtcblxuICAgICAgICBpZiAoa2V5TGVuZ3RoICE9PSAzMikge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEludmFsaWQgRWQyNTUxOSBrZXkgbGVuZ3RoOiAke2tleUxlbmd0aH0gKGV4cGVjdGVkIDMyKWApO1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJhd1B1YmxpY0tleSA9IHNzaEtleUJ1ZmZlci5zdWJhcnJheShvZmZzZXQsIG9mZnNldCArIDMyKTtcblxuICAgICAgICAvLyBDcmVhdGUgYSBOb2RlLmpzIHB1YmxpYyBrZXkgb2JqZWN0XG4gICAgICAgIGNvbnN0IHB1YmxpY0tleSA9IGNyeXB0by5jcmVhdGVQdWJsaWNLZXkoe1xuICAgICAgICAgIGtleTogQnVmZmVyLmNvbmNhdChbXG4gICAgICAgICAgICBCdWZmZXIuZnJvbShbMHgzMCwgMHgyYV0pLCAvLyBERVIgc2VxdWVuY2UgaGVhZGVyXG4gICAgICAgICAgICBCdWZmZXIuZnJvbShbMHgzMCwgMHgwNV0pLCAvLyBBbGdvcml0aG0gaWRlbnRpZmllciBzZXF1ZW5jZVxuICAgICAgICAgICAgQnVmZmVyLmZyb20oWzB4MDYsIDB4MDMsIDB4MmIsIDB4NjUsIDB4NzBdKSwgLy8gRWQyNTUxOSBPSURcbiAgICAgICAgICAgIEJ1ZmZlci5mcm9tKFsweDAzLCAweDIxLCAweDAwXSksIC8vIFB1YmxpYyBrZXkgYml0IHN0cmluZ1xuICAgICAgICAgICAgcmF3UHVibGljS2V5LFxuICAgICAgICAgIF0pLFxuICAgICAgICAgIGZvcm1hdDogJ2RlcicsXG4gICAgICAgICAgdHlwZTogJ3Nwa2knLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBWZXJpZnkgdGhlIHNpZ25hdHVyZVxuICAgICAgICBjb25zdCBpc1ZhbGlkID0gY3J5cHRvLnZlcmlmeShudWxsLCBjaGFsbGVuZ2UsIHB1YmxpY0tleSwgc2lnbmF0dXJlKTtcbiAgICAgICAgY29uc29sZS5sb2coYPCflJAgRWQyNTUxOSBzaWduYXR1cmUgdmVyaWZpY2F0aW9uOiAke2lzVmFsaWQgPyAnUEFTU0VEJyA6ICdGQUlMRUQnfWApO1xuICAgICAgICByZXR1cm4gaXNWYWxpZDtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5lcnJvcihgVW5zdXBwb3J0ZWQga2V5IHR5cGU6ICR7a2V5VHlwZX1gKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignU1NIIHNpZ25hdHVyZSB2ZXJpZmljYXRpb24gZmFpbGVkOicsIGVycm9yKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgU1NIIGtleSBpcyBhdXRob3JpemVkIGZvciB1c2VyXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGNoZWNrU1NIS2V5QXV0aG9yaXphdGlvbih1c2VySWQ6IHN0cmluZywgcHVibGljS2V5OiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgb3MgPSByZXF1aXJlKCdvcycpO1xuICAgICAgY29uc3QgZnMgPSByZXF1aXJlKCdmcycpO1xuICAgICAgY29uc3QgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcblxuICAgICAgLy8gQ2hlY2sgdXNlcidzIGF1dGhvcml6ZWRfa2V5cyBmaWxlXG4gICAgICBjb25zdCBob21lRGlyID0gdXNlcklkID09PSBwcm9jZXNzLmVudi5VU0VSID8gb3MuaG9tZWRpcigpIDogYC9ob21lLyR7dXNlcklkfWA7XG4gICAgICBjb25zdCBhdXRob3JpemVkS2V5c1BhdGggPSBwYXRoLmpvaW4oaG9tZURpciwgJy5zc2gnLCAnYXV0aG9yaXplZF9rZXlzJyk7XG5cbiAgICAgIGlmICghZnMuZXhpc3RzU3luYyhhdXRob3JpemVkS2V5c1BhdGgpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgYXV0aG9yaXplZEtleXMgPSBmcy5yZWFkRmlsZVN5bmMoYXV0aG9yaXplZEtleXNQYXRoLCAndXRmOCcpO1xuICAgICAgY29uc3Qga2V5UGFydHMgPSBwdWJsaWNLZXkudHJpbSgpLnNwbGl0KCcgJyk7XG4gICAgICBjb25zdCBrZXlEYXRhID0ga2V5UGFydHMubGVuZ3RoID4gMSA/IGtleVBhcnRzWzFdIDoga2V5UGFydHNbMF07XG5cbiAgICAgIC8vIENoZWNrIGlmIHRoZSBrZXkgZXhpc3RzIGluIGF1dGhvcml6ZWRfa2V5c1xuICAgICAgcmV0dXJuIGF1dGhvcml6ZWRLZXlzLmluY2x1ZGVzKGtleURhdGEpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjaGVja2luZyBTU0gga2V5IGF1dGhvcml6YXRpb246JywgZXJyb3IpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgY3VycmVudCBzeXN0ZW0gdXNlclxuICAgKi9cbiAgZ2V0Q3VycmVudFVzZXIoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gcHJvY2Vzcy5lbnYuVVNFUiB8fCBwcm9jZXNzLmVudi5VU0VSTkFNRSB8fCAndW5rbm93bic7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgdXNlciBleGlzdHMgb24gc3lzdGVtXG4gICAqL1xuICBhc3luYyB1c2VyRXhpc3RzKHVzZXJJZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHsgc3Bhd25TeW5jIH0gPSByZXF1aXJlKCdjaGlsZF9wcm9jZXNzJyk7XG4gICAgICBjb25zdCByZXN1bHQgPSBzcGF3blN5bmMoJ2lkJywgW3VzZXJJZF0sIHsgc3RkaW86ICdpZ25vcmUnIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdC5zdGF0dXMgPT09IDA7XG4gICAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG59XG4iXX0=