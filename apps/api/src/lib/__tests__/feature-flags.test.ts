import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock logger
vi.mock('@pull/core/services', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
  })),
}));

describe('Feature Flags', () => {
  // Save original env
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  describe('isFeatureEnabled()', () => {
    it('should return correct default values for enabled features', async () => {
      const { isFeatureEnabled, FEATURE_FLAGS } = await import('../feature-flags');
      
      expect(isFeatureEnabled('auth')).toBe(true);
      expect(isFeatureEnabled('predictions')).toBe(true);
      expect(isFeatureEnabled('trading_basic')).toBe(true);
      expect(isFeatureEnabled('rewards_basic')).toBe(true);
      expect(isFeatureEnabled('kyc')).toBe(true);
      expect(isFeatureEnabled('payments_deposits')).toBe(true);
      expect(isFeatureEnabled('payments_withdrawals')).toBe(true);
    });

    it('should return correct default values for disabled features', async () => {
      const { isFeatureEnabled } = await import('../feature-flags');
      
      expect(isFeatureEnabled('ncaa_brackets')).toBe(false);
      expect(isFeatureEnabled('ncaa_betting')).toBe(false);
      expect(isFeatureEnabled('golf')).toBe(false);
      expect(isFeatureEnabled('nba')).toBe(false);
      expect(isFeatureEnabled('mlb')).toBe(false);
      expect(isFeatureEnabled('fantasy_leagues')).toBe(false);
      expect(isFeatureEnabled('fantasy_markets')).toBe(false);
      expect(isFeatureEnabled('real_estate')).toBe(false);
      expect(isFeatureEnabled('rwa_tokenization')).toBe(false);
      expect(isFeatureEnabled('social_trading')).toBe(false);
      expect(isFeatureEnabled('ai_insights')).toBe(false);
      expect(isFeatureEnabled('ai_copilot')).toBe(false);
      expect(isFeatureEnabled('viral_growth')).toBe(false);
      expect(isFeatureEnabled('stories')).toBe(false);
      expect(isFeatureEnabled('cash_battles')).toBe(false);
      expect(isFeatureEnabled('squads')).toBe(false);
      expect(isFeatureEnabled('vip')).toBe(false);
      expect(isFeatureEnabled('insurance')).toBe(false);
      expect(isFeatureEnabled('nfts')).toBe(false);
    });

    it('should respect environment variable override with "true"', async () => {
      process.env.FEATURE_FLAG_NCAA_BRACKETS = 'true';
      vi.resetModules();
      
      const { isFeatureEnabled } = await import('../feature-flags');
      expect(isFeatureEnabled('ncaa_brackets')).toBe(true);
    });

    it('should respect environment variable override with "1"', async () => {
      process.env.FEATURE_FLAG_GOLF = '1';
      vi.resetModules();
      
      const { isFeatureEnabled } = await import('../feature-flags');
      expect(isFeatureEnabled('golf')).toBe(true);
    });

    it('should respect environment variable override with "false"', async () => {
      process.env.FEATURE_FLAG_AUTH = 'false';
      vi.resetModules();
      
      const { isFeatureEnabled } = await import('../feature-flags');
      expect(isFeatureEnabled('auth')).toBe(false);
    });

    it('should use default value when env var is not "true" or "1"', async () => {
      process.env.FEATURE_FLAG_NCAA_BRACKETS = 'maybe';
      vi.resetModules();
      
      const { isFeatureEnabled } = await import('../feature-flags');
      expect(isFeatureEnabled('ncaa_brackets')).toBe(false);
    });

    it('should handle uppercase flag names in env vars', async () => {
      process.env.FEATURE_FLAG_NCAA_BETTING = 'true';
      vi.resetModules();
      
      const { isFeatureEnabled } = await import('../feature-flags');
      expect(isFeatureEnabled('ncaa_betting')).toBe(true);
    });
  });

  describe('notImplemented()', () => {
    it('should return 501 status code', async () => {
      const { notImplemented } = await import('../feature-flags');
      const app = new Hono();
      
      app.get('/test', (c) => notImplemented(c, 'test_feature'));
      
      const res = await app.request('/test', { method: 'GET' });
      expect(res.status).toBe(501);
    });

    it('should return proper error response structure', async () => {
      const { notImplemented } = await import('../feature-flags');
      const app = new Hono();
      
      app.get('/test', (c) => notImplemented(c, 'test_feature'));
      
      const res = await app.request('/test', { method: 'GET' });
      const data = await res.json();
      
      expect(data).toMatchObject({
        success: false,
        error: {
          code: 'NOT_IMPLEMENTED',
          feature: 'test_feature',
        },
      });
      expect(data.requestId).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });

    it('should include custom message when provided', async () => {
      const { notImplemented } = await import('../feature-flags');
      const app = new Hono();
      
      app.get('/test', (c) => notImplemented(c, 'test_feature', 'Custom message'));
      
      const res = await app.request('/test', { method: 'GET' });
      const data = await res.json();
      
      expect(data.error.message).toBe('Custom message');
    });

    it('should use default message when not provided', async () => {
      const { notImplemented } = await import('../feature-flags');
      const app = new Hono();
      
      app.get('/test', (c) => notImplemented(c, 'test_feature'));
      
      const res = await app.request('/test', { method: 'GET' });
      const data = await res.json();
      
      expect(data.error.message).toBe('The test_feature feature is not yet available');
    });

    it('should use requestId from context if available', async () => {
      const { notImplemented } = await import('../feature-flags');
      const app = new Hono();
      
      app.use('*', (c, next) => {
        c.set('requestId', 'custom-request-id');
        return next();
      });
      app.get('/test', (c) => notImplemented(c, 'test_feature'));
      
      const res = await app.request('/test', { method: 'GET' });
      const data = await res.json();
      
      expect(data.requestId).toBe('custom-request-id');
    });
  });

  describe('requireFeature() middleware', () => {
    it('should block disabled features', async () => {
      const { requireFeature } = await import('../feature-flags');
      const app = new Hono();
      
      app.get('/ncaa', requireFeature('ncaa_brackets'), (c) => c.json({ success: true }));
      
      const res = await app.request('/ncaa', { method: 'GET' });
      expect(res.status).toBe(501);
      
      const data = await res.json();
      expect(data).toMatchObject({
        success: false,
        error: {
          code: 'NOT_IMPLEMENTED',
          feature: 'ncaa_brackets',
        },
      });
    });

    it('should allow enabled features', async () => {
      const { requireFeature } = await import('../feature-flags');
      const app = new Hono();
      
      app.get('/auth', requireFeature('auth'), (c) => c.json({ success: true }));
      
      const res = await app.request('/auth', { method: 'GET' });
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data).toEqual({ success: true });
    });

    it('should use custom feature name when provided', async () => {
      const { requireFeature } = await import('../feature-flags');
      const app = new Hono();
      
      app.get('/ncaa', requireFeature('ncaa_brackets', 'NCAA Tournament Brackets'), (c) => 
        c.json({ success: true })
      );
      
      const res = await app.request('/ncaa', { method: 'GET' });
      const data = await res.json();
      
      expect(data.error.feature).toBe('NCAA Tournament Brackets');
    });

    it('should allow enabled features via environment override', async () => {
      process.env.FEATURE_FLAG_GOLF = 'true';
      vi.resetModules();
      
      const { requireFeature } = await import('../feature-flags');
      const app = new Hono();
      
      app.get('/golf', requireFeature('golf'), (c) => c.json({ success: true }));
      
      const res = await app.request('/golf', { method: 'GET' });
      expect(res.status).toBe(200);
    });
  });

  describe('getAllFeatureFlags()', () => {
    it('should return all feature flags with current status', async () => {
      const { getAllFeatureFlags } = await import('../feature-flags');
      
      const flags = getAllFeatureFlags();
      
      expect(flags).toHaveProperty('auth');
      expect(flags).toHaveProperty('predictions');
      expect(flags).toHaveProperty('ncaa_brackets');
      expect(flags).toHaveProperty('golf');
      expect(flags.auth).toBe(true);
      expect(flags.ncaa_brackets).toBe(false);
    });

    it('should respect environment overrides in returned flags', async () => {
      process.env.FEATURE_FLAG_NCAA_BRACKETS = 'true';
      process.env.FEATURE_FLAG_AUTH = 'false';
      vi.resetModules();
      
      const { getAllFeatureFlags } = await import('../feature-flags');
      const flags = getAllFeatureFlags();
      
      expect(flags.ncaa_brackets).toBe(true);
      expect(flags.auth).toBe(false);
    });

    it('should return object with all feature flag keys', async () => {
      const { getAllFeatureFlags, FEATURE_FLAGS } = await import('../feature-flags');
      
      const flags = getAllFeatureFlags();
      const expectedKeys = Object.keys(FEATURE_FLAGS);
      const actualKeys = Object.keys(flags);
      
      expect(actualKeys.sort()).toEqual(expectedKeys.sort());
    });
  });

  describe('NotImplementedError', () => {
    it('should be constructible with feature name', async () => {
      const { NotImplementedError } = await import('../feature-flags');
      
      const error = new NotImplementedError('test_feature');
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('NotImplementedError');
      expect(error.message).toBe('Feature not implemented: test_feature');
    });

    it('should be throwable and catchable', async () => {
      const { NotImplementedError } = await import('../feature-flags');
      
      expect(() => {
        throw new NotImplementedError('test');
      }).toThrow('Feature not implemented: test');
    });
  });
});
