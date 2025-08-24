import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { authenticateRequest, validateSession, checkPermissions } from './auth';

// Create mock jwt module
const mockJwt = {
  verify: vi.fn(),
  sign: vi.fn()
};

// Mock jsonwebtoken module
vi.mock('jsonwebtoken', () => mockJwt);

describe.skip('Authentication Middleware - Comprehensive Tests', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      headers: {},
      cookies: {},
      query: {},
      body: {},
      ip: '127.0.0.1',
      get: vi.fn((header: string) => req.headers?.[header.toLowerCase()])
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      cookie: vi.fn().mockReturnThis(),
      clearCookie: vi.fn().mockReturnThis(),
      locals: {}
    };

    next = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Token Validation Edge Cases', () => {
    it('should reject malformed JWT tokens', async () => {
      req.headers = { authorization: 'Bearer malformed.token.here' };
      
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authenticateRequest(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Invalid token')
        })
      );
    });

    it('should reject expired tokens', async () => {
      req.headers = { authorization: 'Bearer expired.token' };
      
      mockJwt.verify.mockImplementation(() => {
        const error: any = new Error('jwt expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      await authenticateRequest(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Token expired'
        })
      );
    });

    it('should handle tokens with invalid signatures', async () => {
      req.headers = { authorization: 'Bearer token.with.invalid.signature' };
      
      mockJwt.verify.mockImplementation(() => {
        const error: any = new Error('invalid signature');
        error.name = 'JsonWebTokenError';
        throw error;
      });

      await authenticateRequest(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('invalid signature')
        })
      );
    });

    it('should reject tokens signed with wrong algorithm', async () => {
      req.headers = { authorization: 'Bearer token' };
      
      // Simulate algorithm mismatch attack
      mockJwt.verify.mockImplementation((token, secret, options: any) => {
        if (options?.algorithms && !options.algorithms.includes('HS256')) {
          throw new Error('invalid algorithm');
        }
        return { userId: 'test', iat: Date.now() / 1000 };
      });

      await authenticateRequest(req as Request, res as Response, next);

      // Should verify with specific algorithm
      expect(mockJwt.verify).toHaveBeenCalledWith(
        'token',
        expect.anything(),
        expect.objectContaining({
          algorithms: ['HS256']
        })
      );
    });

    it('should handle tokens from multiple sources with priority', async () => {
      // Token in multiple places - header should take priority
      req.headers = { authorization: 'Bearer header-token' };
      req.cookies = { token: 'cookie-token' };
      req.query = { token: 'query-token' };

      mockJwt.verify.mockReturnValue({
        userId: 'user1',
        iat: Date.now() / 1000
      });

      await authenticateRequest(req as Request, res as Response, next);

      // Should use header token first
      expect(mockJwt.verify).toHaveBeenCalledWith('header-token', expect.anything(), expect.anything());
    });

    it('should fallback to cookie token when no header', async () => {
      req.cookies = { token: 'cookie-token' };

      mockJwt.verify.mockReturnValue({
        userId: 'user1',
        iat: Date.now() / 1000
      });

      await authenticateRequest(req as Request, res as Response, next);

      expect(mockJwt.verify).toHaveBeenCalledWith('cookie-token', expect.anything(), expect.anything());
    });

    it('should sanitize token before verification', async () => {
      // Token with potential injection
      req.headers = { authorization: 'Bearer token-with-<script>-injection' };

      mockJwt.verify.mockReturnValue({
        userId: 'user1',
        iat: Date.now() / 1000
      });

      await authenticateRequest(req as Request, res as Response, next);

      // Should sanitize token
      expect(mockJwt.verify).toHaveBeenCalledWith(
        expect.not.stringContaining('<script>'),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('Session Validation Edge Cases', () => {
    it('should reject sessions that are too old', async () => {
      const oldSessionTime = Date.now() / 1000 - (24 * 60 * 60 + 1); // 24h + 1s ago
      
      req.headers = { authorization: 'Bearer valid-token' };
      mockJwt.verify.mockReturnValue({
        userId: 'user1',
        sessionId: 'session1',
        iat: oldSessionTime
      });

      await validateSession(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Session expired'
        })
      );
    });

    it('should handle session refresh for active users', async () => {
      const recentActivity = Date.now() / 1000 - 1800; // 30 minutes ago
      
      req.headers = { authorization: 'Bearer valid-token' };
      mockJwt.verify.mockReturnValue({
        userId: 'user1',
        sessionId: 'session1',
        iat: recentActivity
      });

      // Mock jwt.sign for refresh token
      mockJwt.sign.mockReturnValue('refreshed-token');

      await validateSession(req as Request, res as Response, next);

      // Should issue refresh token
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: 'strict'
        })
      );
    });

    it('should detect and prevent session hijacking', async () => {
      req.headers = { authorization: 'Bearer valid-token' };
      req.ip = '192.168.1.100'; // Different IP
      
      mockJwt.verify.mockReturnValue({
        userId: 'user1',
        sessionId: 'session1',
        ip: '10.0.0.1', // Original IP
        iat: Date.now() / 1000
      });

      await validateSession(req as Request, res as Response, next);

      // Should detect IP change
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Security violation')
        })
      );
    });

    it('should handle concurrent session limits', async () => {
      req.headers = { authorization: 'Bearer valid-token' };
      
      mockJwt.verify.mockReturnValue({
        userId: 'user1',
        sessionId: 'session5', // 5th session
        iat: Date.now() / 1000
      });

      // Mock session store to show user has max sessions
      const mockSessionStore = {
        getUserSessionCount: vi.fn().mockResolvedValue(5)
      };

      await validateSession(req as Request, res as Response, next, {
        maxConcurrentSessions: 3,
        sessionStore: mockSessionStore
      });

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Maximum concurrent sessions exceeded'
        })
      );
    });
  });

  describe('Permission Checking Edge Cases', () => {
    it('should handle hierarchical permissions correctly', async () => {
      res.locals = {
        user: {
          id: 'user1',
          roles: ['admin']
        }
      };

      const requireAdmin = checkPermissions(['admin']);
      await requireAdmin(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject users with insufficient permissions', async () => {
      res.locals = {
        user: {
          id: 'user1',
          roles: ['user']
        }
      };

      const requireAdmin = checkPermissions(['admin']);
      await requireAdmin(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Insufficient permissions'
        })
      );
    });

    it('should handle wildcard permissions', async () => {
      res.locals = {
        user: {
          id: 'user1',
          permissions: ['sessions:*'] // Wildcard permission
        }
      };

      const requireSessionWrite = checkPermissions(['sessions:write']);
      await requireSessionWrite(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('should validate resource-specific permissions', async () => {
      res.locals = {
        user: {
          id: 'user1',
          permissions: ['session:123:read'] // Specific resource
        }
      };
      
      req.params = { sessionId: '456' }; // Different session

      const requireSessionRead = checkPermissions((req) => [
        `session:${req.params.sessionId}:read`
      ]);
      
      await requireSessionRead(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should handle permission inheritance', async () => {
      res.locals = {
        user: {
          id: 'user1',
          roles: ['moderator'],
          rolePermissions: {
            moderator: ['user:*', 'session:view']
          }
        }
      };

      const requireUserManagement = checkPermissions(['user:delete']);
      await requireUserManagement(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('CSRF Protection Edge Cases', () => {
    it('should validate CSRF tokens for state-changing operations', async () => {
      req.method = 'POST';
      req.headers = { 
        'x-csrf-token': 'invalid-csrf-token'
      };
      req.session = {
        csrfToken: 'valid-csrf-token'
      };

      await authenticateRequest(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid CSRF token'
        })
      );
    });

    it('should skip CSRF for safe methods', async () => {
      req.method = 'GET';
      req.headers = { authorization: 'Bearer valid-token' };
      
      mockJwt.verify.mockReturnValue({
        userId: 'user1',
        iat: Date.now() / 1000
      });

      await authenticateRequest(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      // Should not check CSRF for GET
    });

    it('should handle double-submit cookie pattern', async () => {
      req.method = 'POST';
      req.headers = { 'x-csrf-token': 'csrf-value' };
      req.cookies = { 'csrf-token': 'csrf-value' };

      mockJwt.verify.mockReturnValue({
        userId: 'user1',
        iat: Date.now() / 1000
      });

      await authenticateRequest(req as Request, res as Response, next);

      // Tokens match, should proceed
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Rate Limiting Edge Cases', () => {
    it('should enforce rate limits per user', async () => {
      const mockRateLimiter = {
        consume: vi.fn().mockRejectedValue({ remainingPoints: 0 })
      };

      req.headers = { authorization: 'Bearer valid-token' };
      mockJwt.verify.mockReturnValue({
        userId: 'user1',
        iat: Date.now() / 1000
      });

      await authenticateRequest(req as Request, res as Response, next, {
        rateLimiter: mockRateLimiter
      });

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too many requests'
        })
      );
    });

    it('should handle rate limit by IP for unauthenticated requests', async () => {
      const mockRateLimiter = {
        consume: vi.fn().mockRejectedValue({ remainingPoints: 0 })
      };

      req.ip = '192.168.1.100';
      // No auth header

      await authenticateRequest(req as Request, res as Response, next, {
        rateLimiter: mockRateLimiter,
        allowAnonymous: true
      });

      expect(mockRateLimiter.consume).toHaveBeenCalledWith('192.168.1.100');
    });

    it('should apply stricter limits for sensitive operations', async () => {
      const mockRateLimiter = {
        consume: vi.fn().mockResolvedValue({ remainingPoints: 1 })
      };

      req.path = '/api/admin/users/delete';
      req.headers = { authorization: 'Bearer valid-token' };
      
      mockJwt.verify.mockReturnValue({
        userId: 'admin1',
        roles: ['admin'],
        iat: Date.now() / 1000
      });

      await authenticateRequest(req as Request, res as Response, next, {
        rateLimiter: mockRateLimiter,
        sensitiveEndpoints: ['/api/admin/*']
      });

      // Should use stricter rate limit
      expect(mockRateLimiter.consume).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ points: 10 }) // Higher cost for sensitive endpoints
      );
    });
  });

  describe('Security Headers', () => {
    it('should set appropriate security headers', async () => {
      req.headers = { authorization: 'Bearer valid-token' };
      
      mockJwt.verify.mockReturnValue({
        userId: 'user1',
        iat: Date.now() / 1000
      });

      await authenticateRequest(req as Request, res as Response, next);

      expect(res.set).toHaveBeenCalledWith({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
      });
    });
  });

  describe('Local Bypass Authentication', () => {
    it('should allow local bypass when enabled', async () => {
      process.env.TUNNELFORGE_AUTH_BYPASS = 'true';
      req.ip = '127.0.0.1';
      
      await authenticateRequest(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.locals.user).toEqual(
        expect.objectContaining({
          id: 'local-user',
          bypass: true
        })
      );

      delete process.env.TUNNELFORGE_AUTH_BYPASS;
    });

    it('should reject local bypass from non-local IPs', async () => {
      process.env.TUNNELFORGE_AUTH_BYPASS = 'true';
      req.ip = '192.168.1.100'; // Non-local IP
      
      await authenticateRequest(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      
      delete process.env.TUNNELFORGE_AUTH_BYPASS;
    });

    it('should validate local bypass token if provided', async () => {
      process.env.TUNNELFORGE_AUTH_BYPASS = 'true';
      process.env.TUNNELFORGE_BYPASS_TOKEN = 'secret-token';
      req.ip = '127.0.0.1';
      req.headers = { 'x-bypass-token': 'wrong-token' };
      
      await authenticateRequest(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      
      delete process.env.TUNNELFORGE_AUTH_BYPASS;
      delete process.env.TUNNELFORGE_BYPASS_TOKEN;
    });
  });

  describe('Audit Logging', () => {
    it('should log authentication failures', async () => {
      const mockLogger = {
        warn: vi.fn(),
        error: vi.fn()
      };

      req.headers = { authorization: 'Bearer invalid-token' };
      req.ip = '192.168.1.100';
      
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authenticateRequest(req as Request, res as Response, next, {
        logger: mockLogger
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'auth_failure',
          ip: '192.168.1.100',
          reason: expect.stringContaining('Invalid token')
        })
      );
    });

    it('should log permission violations', async () => {
      const mockLogger = {
        warn: vi.fn()
      };

      res.locals = {
        user: {
          id: 'user1',
          roles: ['user']
        }
      };

      const requireAdmin = checkPermissions(['admin'], { logger: mockLogger });
      await requireAdmin(req as Request, res as Response, next);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'permission_denied',
          userId: 'user1',
          required: ['admin'],
          actual: ['user']
        })
      );
    });
  });
});
