# Security Best Practices

Comprehensive security guidelines for TunnelForge/TunnelForge, covering authentication, authorization, secure coding practices, and threat mitigation.

## Security Principles

### 1. Defense in Depth
- Multiple layers of security controls
- No single point of failure
- Assume breach and limit blast radius
- Regular security audits and updates

### 2. Principle of Least Privilege
- Grant minimum necessary permissions
- Time-bound access where possible
- Regular access reviews
- Separate service accounts

### 3. Zero Trust Architecture
- Never trust, always verify
- Authenticate every request
- Encrypt data in transit and at rest
- Continuous security monitoring

## Secure Coding Practices

### Input Validation
```typescript
// Always validate and sanitize user input
function validateSessionName(name: string): string {
  // Remove control characters and limit length
  const sanitized = name.replace(/[\x00-\x1F\x7F]/g, '').trim();
  
  if (sanitized.length === 0) {
    throw new Error('Session name cannot be empty');
  }
  
  if (sanitized.length > 255) {
    throw new Error('Session name too long');
  }
  
  // Prevent path traversal
  if (sanitized.includes('..') || sanitized.includes('/')) {
    throw new Error('Invalid session name');
  }
  
  return sanitized;
}
```

### SQL Injection Prevention
```typescript
// Use parameterized queries
const query = 'SELECT * FROM sessions WHERE user_id = ? AND status = ?';
const params = [userId, 'active'];
await db.query(query, params);

// Never use string concatenation
// BAD: `SELECT * FROM sessions WHERE id = '${sessionId}'`
```

### XSS Prevention
```typescript
// Escape HTML entities
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };
  
  return text.replace(/[&<>"'/]/g, char => map[char]);
}

// Use Content Security Policy
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  );
  next();
});
```

### Secrets Management
```typescript
// Never hardcode secrets
// BAD: const apiKey = 'sk-1234567890';

// Use environment variables
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY environment variable not set');
}

// Use secure storage for sensitive data
import { SecretManager } from '@google-cloud/secret-manager';
const client = new SecretManager.SecretManagerServiceClient();
const [secret] = await client.accessSecretVersion({
  name: 'projects/my-project/secrets/api-key/versions/latest'
});
```

## TunnelForge Server Security Configuration

## Authentication Options

TunnelForge Server provides several authentication mechanisms to secure terminal access:

### 1. Standard Authentication

**System User Password** (default)
- Uses the operating system's user authentication
- Validates against local user accounts
- Supports optional SSH key authentication with `--enable-ssh-keys`

**No Authentication Mode**
- Enabled with `--no-auth` flag
- Automatically logs in as the current user
- **WARNING**: Anyone with network access can use the terminal

### 2. Local Bypass Authentication

The `--allow-local-bypass` flag enables a special authentication mode that allows localhost connections to bypass normal authentication requirements.

#### Configuration Options

**Basic Local Bypass**
```bash
tunnelforge-server --allow-local-bypass
```
- Allows any connection from localhost (127.0.0.1, ::1) to access without authentication
- No token required

**Secured Local Bypass**
```bash
tunnelforge-server --allow-local-bypass --local-auth-token <secret-token>
```
- Localhost connections must provide token via `X-TunnelForge-Local` header
- Adds an additional security layer for local connections

#### Security Implementation

The local bypass feature implements several security checks to prevent spoofing:

1. **IP Address Validation** (`web/src/server/middleware/auth.ts:24-48`)
   - Verifies connection originates from localhost IPs (127.0.0.1, ::1, ::ffff:127.0.0.1)
   - Checks both `req.ip` and `req.socket.remoteAddress`

2. **Header Verification**
   - Ensures no forwarding headers are present (`X-Forwarded-For`, `X-Real-IP`, `X-Forwarded-Host`)
   - Prevents proxy spoofing attacks

3. **Hostname Validation**
   - Confirms request hostname is localhost, 127.0.0.1, or [::1]
   - Additional layer of verification

4. **Token Authentication** (when configured)
   - Requires `X-TunnelForge-Local` header to match configured token
   - Provides shared secret authentication for local tools

#### Security Implications

**Benefits:**
- Enables automated tools and scripts on the same machine to access terminals
- Useful for development workflows and CI/CD pipelines
- Allows local monitoring tools without exposing credentials

**Risks:**
- Any process on the local machine can access terminals (without token)
- Malicious local software could exploit this access
- Token-based mode mitigates but doesn't eliminate local access risks

**Recommended Usage:**
1. **Development Environments**: Safe for local development machines
2. **CI/CD Servers**: Use with token authentication for build scripts
3. **Production Servers**: NOT recommended unless:
   - Combined with token authentication
   - Server has strict local access controls
   - Used only for specific automation needs

#### Example Use Cases

**Local Development Tools**
```javascript
// Local tool accessing TunnelForge without authentication
const response = await fetch('http://localhost:4020/api/sessions', {
  headers: {
    'X-TunnelForge-Local': 'my-secret-token' // Only if token configured
  }
});
```

**Automated Testing**
```bash
# Start server with local bypass for tests
tunnelforge-server --allow-local-bypass --local-auth-token test-token

# Test script can now access without password
curl -H "X-TunnelForge-Local: test-token" http://localhost:4020/api/sessions
```

## Additional Security Considerations

### Network Binding
- Default: Binds to all interfaces (0.0.0.0)
- Use `--bind 127.0.0.1` to restrict to localhost only
- Combine with `--allow-local-bypass` for local-only access

### SSH Key Authentication
- Enable with `--enable-ssh-keys`
- Disable passwords with `--disallow-user-password`
- More secure than password authentication

### HTTPS/TLS
- TunnelForge does not provide built-in TLS
- Use a reverse proxy (nginx, Caddy) for HTTPS
- Or use secure tunnels (Tailscale, ngrok)

### Best Practices
1. Always use authentication in production
2. Restrict network binding when possible
3. Use token authentication with local bypass
4. Monitor access logs for suspicious activity
5. Keep the server updated for security patches

## Threat Model

### External Threats

#### 1. Unauthorized Access
**Risk**: Attackers gaining terminal access
**Mitigations**:
- Strong authentication (passwords, SSH keys)
- Rate limiting on login attempts
- IP allowlisting for production
- Audit logging of all access

#### 2. Session Hijacking
**Risk**: Attackers taking over active sessions
**Mitigations**:
- Secure session tokens (cryptographically random)
- Token rotation and expiration
- Bind sessions to IP addresses
- Use HTTPS/WSS for all communications

#### 3. Command Injection
**Risk**: Executing arbitrary commands
**Mitigations**:
- Validate all command parameters
- Use allowlists for commands
- Escape shell metacharacters
- Run terminals in restricted environments

#### 4. Data Exfiltration
**Risk**: Unauthorized data access
**Mitigations**:
- Encrypt sensitive data at rest
- Audit file access patterns
- Implement data loss prevention
- Monitor network traffic

### Internal Threats

#### 1. Privilege Escalation
**Risk**: Users gaining elevated permissions
**Mitigations**:
- Run services with minimal privileges
- Use separate service accounts
- Regular permission audits
- Implement sudo policies

#### 2. Insider Threats
**Risk**: Malicious authorized users
**Mitigations**:
- Comprehensive audit logging
- Anomaly detection
- Regular access reviews
- Separation of duties

## Security Headers

```typescript
// Implement security headers middleware
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // HTTPS enforcement
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
  
  next();
});
```

## Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// Login rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

app.post('/api/auth/login', loginLimiter, loginHandler);

// API rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', apiLimiter);
```

## Audit Logging

```typescript
interface AuditLog {
  timestamp: Date;
  user: string;
  action: string;
  resource: string;
  ip: string;
  userAgent: string;
  success: boolean;
  details?: any;
}

class AuditLogger {
  async log(entry: AuditLog): Promise<void> {
    // Log to secure storage
    await this.writeToSecureLog(entry);
    
    // Alert on suspicious activity
    if (this.isSuspicious(entry)) {
      await this.alertSecurityTeam(entry);
    }
  }
  
  private isSuspicious(entry: AuditLog): boolean {
    // Multiple failed login attempts
    // Access from unusual locations
    // Privilege escalation attempts
    // Data exfiltration patterns
    return false; // Implementation details
  }
}
```

## Dependency Security

### Regular Updates
```bash
# Check for vulnerabilities
pnpm audit
npm audit

# Update dependencies
pnpm update
pnpm audit fix

# Use tools like Dependabot or Renovate
```

### Supply Chain Security
```json
// package.json - use exact versions for production
{
  "dependencies": {
    "express": "4.18.2", // Exact version
    "xterm": "5.3.0"     // No ^ or ~
  },
  "overrides": {
    // Force specific versions for transitive dependencies
    "minimist": "1.2.8"
  }
}
```

## Encryption

### Data at Rest
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

class Encryptor {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;
  
  constructor(key: string) {
    this.key = Buffer.from(key, 'hex');
  }
  
  encrypt(text: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return iv.toString('hex') + ':' + 
           authTag.toString('hex') + ':' + 
           encrypted;
  }
  
  decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

### Data in Transit
- Always use HTTPS/TLS for web traffic
- Use WSS for WebSocket connections
- Implement certificate pinning for mobile apps
- Use VPN or SSH tunnels for sensitive operations

## Security Testing

### Static Analysis
```bash
# TypeScript/JavaScript
npm install -D eslint-plugin-security
pnpm dlx @sonarcloud/sonarcloud-scan

# Swift
swiftlint analyze --compiler-log-path build.log
```

### Dynamic Analysis
```bash
# OWASP ZAP for web application scanning
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t http://localhost:4020

# Burp Suite for manual testing
# Metasploit for penetration testing
```

### Dependency Scanning
```yaml
# GitHub Actions workflow
- name: Run Snyk Security Scan
  uses: snyk/actions/node@master
  env:
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
  with:
    args: --severity-threshold=high
```

## Incident Response

### Response Plan
1. **Detection**: Monitor logs and alerts
2. **Containment**: Isolate affected systems
3. **Investigation**: Analyze root cause
4. **Eradication**: Remove threat
5. **Recovery**: Restore normal operations
6. **Lessons Learned**: Post-incident review

### Security Contacts
- Security Team: security@tunnelforge.com
- Bug Bounty: https://tunnelforge.com/security
- CVE Reporting: Follow responsible disclosure

## Compliance

### Standards
- OWASP Top 10
- CIS Controls
- NIST Cybersecurity Framework
- ISO 27001/27002

### Regular Audits
- Quarterly dependency updates
- Annual penetration testing
- Continuous security monitoring
- Regular security training
