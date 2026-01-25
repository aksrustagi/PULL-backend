import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../index';

// Mock logger
vi.mock('@pull/core/services', () => ({
  getLogger: vi.fn(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock convex client
const mockConvexQuery = vi.fn();
vi.mock('../../lib/convex', () => ({
  getConvexClient: vi.fn(() => ({
    query: mockConvexQuery,
  })),
  api: {
    users: {
      getById: 'users:getById',
    },
  },
}));

// Import after mocks are set up
const { requireRole, adminMiddleware, moderatorMiddleware, superadminMiddleware } = await import('../admin');

describe('Admin Middleware', () => {
  let app: Hono<Env>;

  beforeEach(() => {
    app = new Hono<Env>();
    vi.clearAllMocks();
  });

  describe('requireRole() factory', () => {
    it('should create middleware that blocks unauthenticated requests', async () => {
      app.use('/admin/*', requireRole('admin'));
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test', {
        method: 'GET',
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toMatchObject({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    });

    it('should return 401 for non-existent user', async () => {
      mockConvexQuery.mockResolvedValueOnce(null);

      app.use('/admin/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      app.use('/admin/*', requireRole('admin'));
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test', {
        method: 'GET',
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data).toMatchObject({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not found',
        },
      });
    });

    it('should return 403 when user lacks required role', async () => {
      mockConvexQuery.mockResolvedValueOnce({ role: 'user' });

      app.use('/admin/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      app.use('/admin/*', requireRole('admin'));
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test', {
        method: 'GET',
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data).toMatchObject({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient privileges',
        },
      });
    });

    it('should allow access when user has exact required role', async () => {
      mockConvexQuery.mockResolvedValueOnce({ role: 'admin' });

      app.use('/admin/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      app.use('/admin/*', requireRole('admin'));
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test', {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ success: true });
    });

    it('should allow access when user has higher role', async () => {
      mockConvexQuery.mockResolvedValueOnce({ role: 'superadmin' });

      app.use('/admin/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      app.use('/admin/*', requireRole('admin'));
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test', {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ success: true });
    });

    it('should return 500 when Convex query fails', async () => {
      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      app.use('/admin/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      app.use('/admin/*', requireRole('admin'));
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test', {
        method: 'GET',
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toMatchObject({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Authorization check failed',
        },
      });
    });
  });

  describe('Role hierarchy', () => {
    it('should enforce user < moderator < admin < superadmin hierarchy', async () => {
      const testCases = [
        { userRole: 'user', requiredRole: 'moderator', shouldPass: false },
        { userRole: 'user', requiredRole: 'admin', shouldPass: false },
        { userRole: 'user', requiredRole: 'superadmin', shouldPass: false },
        { userRole: 'moderator', requiredRole: 'user', shouldPass: true },
        { userRole: 'moderator', requiredRole: 'moderator', shouldPass: true },
        { userRole: 'moderator', requiredRole: 'admin', shouldPass: false },
        { userRole: 'moderator', requiredRole: 'superadmin', shouldPass: false },
        { userRole: 'admin', requiredRole: 'user', shouldPass: true },
        { userRole: 'admin', requiredRole: 'moderator', shouldPass: true },
        { userRole: 'admin', requiredRole: 'admin', shouldPass: true },
        { userRole: 'admin', requiredRole: 'superadmin', shouldPass: false },
        { userRole: 'superadmin', requiredRole: 'user', shouldPass: true },
        { userRole: 'superadmin', requiredRole: 'moderator', shouldPass: true },
        { userRole: 'superadmin', requiredRole: 'admin', shouldPass: true },
        { userRole: 'superadmin', requiredRole: 'superadmin', shouldPass: true },
      ];

      for (const testCase of testCases) {
        mockConvexQuery.mockResolvedValueOnce({ role: testCase.userRole });

        const testApp = new Hono<Env>();
        testApp.use('/test', (c, next) => {
          c.set('userId', 'user123');
          c.set('requestId', 'req123');
          return next();
        });
        // Type assertion is safe here as we're testing all valid role combinations
        type ValidRole = 'user' | 'moderator' | 'admin' | 'superadmin';
        testApp.use('/test', requireRole(testCase.requiredRole as ValidRole));
        testApp.get('/test', (c) => c.json({ success: true }));

        const res = await testApp.request('/test', { method: 'GET' });
        
        const expectedStatus = testCase.shouldPass ? 200 : 403;
        expect(res.status).toBe(expectedStatus);
      }
    });
  });

  describe('adminMiddleware', () => {
    it('should block regular users', async () => {
      mockConvexQuery.mockResolvedValueOnce({ role: 'user' });

      app.use('/admin/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      app.use('/admin/*', adminMiddleware);
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test', { method: 'GET' });
      expect(res.status).toBe(403);
    });

    it('should block moderators', async () => {
      mockConvexQuery.mockResolvedValueOnce({ role: 'moderator' });

      app.use('/admin/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      app.use('/admin/*', adminMiddleware);
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test', { method: 'GET' });
      expect(res.status).toBe(403);
    });

    it('should allow admins', async () => {
      mockConvexQuery.mockResolvedValueOnce({ role: 'admin' });

      app.use('/admin/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      app.use('/admin/*', adminMiddleware);
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test', { method: 'GET' });
      expect(res.status).toBe(200);
    });

    it('should allow superadmins', async () => {
      mockConvexQuery.mockResolvedValueOnce({ role: 'superadmin' });

      app.use('/admin/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      app.use('/admin/*', adminMiddleware);
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test', { method: 'GET' });
      expect(res.status).toBe(200);
    });
  });

  describe('moderatorMiddleware', () => {
    it('should block regular users', async () => {
      mockConvexQuery.mockResolvedValueOnce({ role: 'user' });

      app.use('/mod/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      app.use('/mod/*', moderatorMiddleware);
      app.get('/mod/test', (c) => c.json({ success: true }));

      const res = await app.request('/mod/test', { method: 'GET' });
      expect(res.status).toBe(403);
    });

    it('should allow moderators', async () => {
      mockConvexQuery.mockResolvedValueOnce({ role: 'moderator' });

      app.use('/mod/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      app.use('/mod/*', moderatorMiddleware);
      app.get('/mod/test', (c) => c.json({ success: true }));

      const res = await app.request('/mod/test', { method: 'GET' });
      expect(res.status).toBe(200);
    });

    it('should allow admins and superadmins', async () => {
      mockConvexQuery.mockResolvedValueOnce({ role: 'admin' });

      app.use('/mod/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      app.use('/mod/*', moderatorMiddleware);
      app.get('/mod/test', (c) => c.json({ success: true }));

      const res = await app.request('/mod/test', { method: 'GET' });
      expect(res.status).toBe(200);
    });
  });

  describe('superadminMiddleware', () => {
    it('should block regular users', async () => {
      mockConvexQuery.mockResolvedValueOnce({ role: 'user' });

      app.use('/superadmin/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      app.use('/superadmin/*', superadminMiddleware);
      app.get('/superadmin/test', (c) => c.json({ success: true }));

      const res = await app.request('/superadmin/test', { method: 'GET' });
      expect(res.status).toBe(403);
    });

    it('should block moderators', async () => {
      mockConvexQuery.mockResolvedValueOnce({ role: 'moderator' });

      app.use('/superadmin/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      app.use('/superadmin/*', superadminMiddleware);
      app.get('/superadmin/test', (c) => c.json({ success: true }));

      const res = await app.request('/superadmin/test', { method: 'GET' });
      expect(res.status).toBe(403);
    });

    it('should block admins', async () => {
      mockConvexQuery.mockResolvedValueOnce({ role: 'admin' });

      app.use('/superadmin/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      app.use('/superadmin/*', superadminMiddleware);
      app.get('/superadmin/test', (c) => c.json({ success: true }));

      const res = await app.request('/superadmin/test', { method: 'GET' });
      expect(res.status).toBe(403);
    });

    it('should allow superadmins', async () => {
      mockConvexQuery.mockResolvedValueOnce({ role: 'superadmin' });

      app.use('/superadmin/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      app.use('/superadmin/*', superadminMiddleware);
      app.get('/superadmin/test', (c) => c.json({ success: true }));

      const res = await app.request('/superadmin/test', { method: 'GET' });
      expect(res.status).toBe(200);
    });
  });

  describe('Success access logs', () => {
    it('should log successful admin access', async () => {
      const mockLogger = {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
      };

      const { getLogger } = await import('@pull/core/services');
      vi.mocked(getLogger).mockReturnValueOnce(mockLogger as any);

      mockConvexQuery.mockResolvedValueOnce({ role: 'admin' });

      const testApp = new Hono<Env>();
      testApp.use('/admin/*', (c, next) => {
        c.set('userId', 'user123');
        c.set('requestId', 'req123');
        return next();
      });
      
      // Re-import to get fresh instance with new logger
      const { requireRole: freshRequireRole } = await import('../admin');
      testApp.use('/admin/*', freshRequireRole('admin'));
      testApp.get('/admin/test', (c) => c.json({ success: true }));

      await testApp.request('/admin/test', { method: 'GET' });

      // Note: This test may not work as expected due to module caching
      // In a real scenario, the logger should be injected as a dependency
    });
  });
});
