/**
 * KYC Route Tests
 * Tests for KYC verification flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock environment variables before importing routes
vi.stubEnv('JWT_SECRET', 'test-secret-key-that-is-at-least-32-characters-long');
vi.stubEnv('PERSONA_API_KEY', 'persona_test_mock_key');
vi.stubEnv('PERSONA_WEBHOOK_SECRET', 'persona_webhook_test_secret');

// Mock Convex client and API
const mockConvexQuery = vi.fn();
const mockConvexMutation = vi.fn();

vi.mock('../../lib/convex', () => ({
  convex: {
    query: (...args: unknown[]) => mockConvexQuery(...args),
    mutation: (...args: unknown[]) => mockConvexMutation(...args),
  },
  api: {
    users: {
      getById: 'users:getById',
      updateKYCStatus: 'users:updateKYCStatus',
    },
    kyc: {
      getByUser: 'kyc:getByUser',
      create: 'kyc:create',
      update: 'kyc:update',
      getLatest: 'kyc:getLatest',
    },
  },
}));

// Mock Persona client
const mockPersonaClient = {
  createInquiry: vi.fn(),
  getInquiry: vi.fn(),
  resumeInquiry: vi.fn(),
  approveInquiry: vi.fn(),
  declineInquiry: vi.fn(),
  verifyWebhook: vi.fn(),
  getLatestInquiryByReferenceId: vi.fn(),
  getInquiryFiles: vi.fn(),
  getVerifications: vi.fn(),
};

vi.mock('@pull/core/services/persona', () => ({
  personaClient: mockPersonaClient,
}));

// Type for Hono app environment
type Env = {
  Variables: {
    userId?: string;
    requestId: string;
  };
};

// ===========================================================================
// Test Fixtures
// ===========================================================================

const mockUserId = 'test-user-123' as const;

const mockUser = {
  _id: mockUserId,
  email: 'test@example.com',
  displayName: 'Test User',
  status: 'active',
  kycStatus: 'pending',
  kycTier: 'none',
};

const mockVerifiedUser = {
  ...mockUser,
  kycStatus: 'approved',
  kycTier: 'verified',
  firstName: 'John',
  lastName: 'Doe',
  dateOfBirth: '1990-01-15',
};

const mockKYCRecord = {
  _id: 'kyc-001',
  userId: mockUserId,
  targetTier: 'basic',
  status: 'in_progress',
  personaInquiryId: 'inq_mock123',
  personaAccountId: 'act_mock123',
  createdAt: Date.now() - 3600000,
  updatedAt: Date.now(),
};

const mockCompletedKYC = {
  ...mockKYCRecord,
  status: 'approved',
  approvedAt: Date.now() - 1800000,
  verifiedData: {
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: '1990-01-15',
    addressLine1: '123 Main St',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94102',
    country: 'US',
  },
};

const mockPersonaInquiry = {
  id: 'inq_mock123',
  type: 'inquiry',
  attributes: {
    status: 'created',
    reference_id: mockUserId,
    name_first: null,
    name_last: null,
    birthdate: null,
    created_at: new Date().toISOString(),
  },
};

const mockApprovedInquiry = {
  ...mockPersonaInquiry,
  attributes: {
    ...mockPersonaInquiry.attributes,
    status: 'approved',
    name_first: 'John',
    name_last: 'Doe',
    birthdate: '1990-01-15',
  },
};

// ===========================================================================
// Test Setup Helpers
// ===========================================================================

function createTestApp(options: { authenticated?: boolean; userId?: string } = {}) {
  const app = new Hono<Env>();

  // Add middleware
  app.use('*', async (c, next) => {
    c.set('requestId', 'test-request-id');
    if (options.authenticated !== false) {
      c.set('userId', options.userId ?? mockUserId);
    }
    await next();
  });

  // Get KYC status
  app.get('/kyc/status', async (c) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const user = await mockConvexQuery('users:getById', { id: userId });
    if (!user) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      }, 404);
    }

    const kycRecord = await mockConvexQuery('kyc:getLatest', { userId });

    return c.json({
      success: true,
      data: {
        kycStatus: user.kycStatus,
        kycTier: user.kycTier,
        currentInquiry: kycRecord ? {
          id: kycRecord._id,
          status: kycRecord.status,
          targetTier: kycRecord.targetTier,
          createdAt: kycRecord.createdAt,
        } : null,
        canUpgrade: user.kycTier !== 'premium' && user.kycTier !== 'institutional',
        tiers: [
          { id: 'none', name: 'None', limits: { daily: 0, monthly: 0 } },
          { id: 'basic', name: 'Basic', limits: { daily: 1000, monthly: 10000 } },
          { id: 'verified', name: 'Verified', limits: { daily: 10000, monthly: 100000 } },
          { id: 'premium', name: 'Premium', limits: { daily: 100000, monthly: 1000000 } },
        ],
      },
    });
  });

  // Start KYC verification
  app.post('/kyc/start', async (c) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const body = await c.req.json();
    const targetTier = body.targetTier || 'basic';

    // Validate target tier
    const validTiers = ['basic', 'verified', 'premium', 'institutional'];
    if (!validTiers.includes(targetTier)) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid target tier' },
      }, 400);
    }

    // Check if user already has pending verification
    const existingKYC = await mockConvexQuery('kyc:getLatest', { userId });
    if (existingKYC && existingKYC.status === 'in_progress') {
      return c.json({
        success: false,
        error: { code: 'KYC_IN_PROGRESS', message: 'Verification already in progress' },
      }, 400);
    }

    // Check if user already at or above target tier
    const user = await mockConvexQuery('users:getById', { id: userId });
    const tierOrder = ['none', 'basic', 'verified', 'premium', 'institutional'];
    if (tierOrder.indexOf(user.kycTier) >= tierOrder.indexOf(targetTier)) {
      return c.json({
        success: false,
        error: { code: 'ALREADY_VERIFIED', message: 'Already at or above target tier' },
      }, 400);
    }

    // Create Persona inquiry
    const { inquiry, sessionToken } = await mockPersonaClient.createInquiry({
      referenceId: userId,
      templateId: `tmpl_${targetTier}`,
    });

    // Create KYC record
    const kycId = await mockConvexMutation('kyc:create', {
      userId,
      targetTier,
      status: 'in_progress',
      personaInquiryId: inquiry.id,
    });

    // Update user KYC status
    await mockConvexMutation('users:updateKYCStatus', {
      id: userId,
      kycStatus: 'identity_pending',
    });

    return c.json({
      success: true,
      data: {
        kycId,
        inquiryId: inquiry.id,
        sessionToken,
        status: 'in_progress',
        targetTier,
      },
    }, 201);
  });

  // Resume KYC verification
  app.post('/kyc/resume', async (c) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const kycRecord = await mockConvexQuery('kyc:getLatest', { userId });
    if (!kycRecord) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No KYC verification found' },
      }, 404);
    }

    if (kycRecord.status !== 'in_progress') {
      return c.json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'KYC verification is not in progress' },
      }, 400);
    }

    const { inquiry, sessionToken } = await mockPersonaClient.resumeInquiry(
      kycRecord.personaInquiryId
    );

    return c.json({
      success: true,
      data: {
        kycId: kycRecord._id,
        inquiryId: inquiry.id,
        sessionToken,
        status: inquiry.attributes.status,
      },
    });
  });

  // Get KYC inquiry status
  app.get('/kyc/inquiry/:inquiryId', async (c) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const inquiryId = c.req.param('inquiryId');
    const kycRecord = await mockConvexQuery('kyc:getLatest', { userId });

    if (!kycRecord || kycRecord.personaInquiryId !== inquiryId) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Inquiry not found' },
      }, 404);
    }

    const inquiry = await mockPersonaClient.getInquiry(inquiryId);

    return c.json({
      success: true,
      data: {
        inquiryId: inquiry.id,
        status: inquiry.attributes.status,
        completedSteps: [],
        remainingSteps: [],
      },
    });
  });

  // Webhook endpoint
  app.post('/kyc/webhook', async (c) => {
    const signature = c.req.header('persona-signature');
    if (!signature) {
      return c.json({
        success: false,
        error: { code: 'INVALID_SIGNATURE', message: 'Missing signature' },
      }, 400);
    }

    try {
      const payload = await c.req.text();
      const { valid, data } = mockPersonaClient.verifyWebhook(payload, signature);

      if (!valid) {
        return c.json({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature' },
        }, 400);
      }

      const eventType = data.type;
      const inquiry = data.data;

      if (eventType === 'inquiry.approved') {
        const referenceId = inquiry.attributes.reference_id;

        // Update KYC record
        await mockConvexMutation('kyc:update', {
          personaInquiryId: inquiry.id,
          status: 'approved',
          verifiedData: {
            firstName: inquiry.attributes.name_first,
            lastName: inquiry.attributes.name_last,
            dateOfBirth: inquiry.attributes.birthdate,
          },
        });

        // Update user
        const kycRecord = await mockConvexQuery('kyc:getLatest', { userId: referenceId });
        await mockConvexMutation('users:updateKYCStatus', {
          id: referenceId,
          kycStatus: 'approved',
          kycTier: kycRecord?.targetTier || 'basic',
        });
      } else if (eventType === 'inquiry.declined') {
        await mockConvexMutation('kyc:update', {
          personaInquiryId: inquiry.id,
          status: 'rejected',
          rejectionReason: inquiry.attributes.decline_reason || 'Verification failed',
        });

        await mockConvexMutation('users:updateKYCStatus', {
          id: inquiry.attributes.reference_id,
          kycStatus: 'rejected',
        });
      }

      return c.json({ success: true, received: true });
    } catch {
      return c.json({
        success: false,
        error: { code: 'WEBHOOK_ERROR', message: 'Webhook processing failed' },
      }, 400);
    }
  });

  // Get KYC history
  app.get('/kyc/history', async (c) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const records = await mockConvexQuery('kyc:getByUser', { userId });

    return c.json({
      success: true,
      data: records || [],
    });
  });

  // Get KYC documents
  app.get('/kyc/documents', async (c) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    const inquiryId = c.req.query('inquiryId');
    
    try {
      // Get inquiry ID - either from query or latest for user
      let targetInquiryId = inquiryId;
      if (!targetInquiryId) {
        const latestInquiry = await mockPersonaClient.getLatestInquiryByReferenceId(userId);
        if (!latestInquiry) {
          return c.json({
            success: true,
            data: {
              documents: [],
              selfies: [],
            },
            timestamp: new Date().toISOString(),
          });
        }
        targetInquiryId = latestInquiry.id;
      }

      const { documents, selfies } = await mockPersonaClient.getInquiryFiles(targetInquiryId);
      const verifications = await mockPersonaClient.getVerifications(targetInquiryId);

      // Format document response (matching actual route implementation)
      const formattedDocuments = documents.map((doc: any) => ({
        id: doc.id,
        kind: doc.attributes.kind,
        status: doc.attributes.status,
        createdAt: doc.attributes.created_at,
        processedAt: doc.attributes.processed_at,
        files: doc.attributes.files.map((f: any) => ({
          id: f.id,
          filename: f.filename,
          page: f.page,
          url: f.url,
          byteSize: f.byte_size,
        })),
      }));

      const formattedSelfies = selfies.map((selfie: any) => ({
        id: selfie.id,
        status: selfie.attributes.status,
        captureMethod: selfie.attributes.capture_method,
        createdAt: selfie.attributes.created_at,
        processedAt: selfie.attributes.processed_at,
        centerPhotoUrl: selfie.attributes.center_photo_url,
        leftPhotoUrl: selfie.attributes.left_photo_url,
        rightPhotoUrl: selfie.attributes.right_photo_url,
      }));

      return c.json({
        success: true,
        data: {
          inquiryId: targetInquiryId,
          documents: formattedDocuments,
          selfies: formattedSelfies,
          verifications,
          totalDocuments: documents.length,
          totalSelfies: selfies.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return c.json({
        success: false,
        error: {
          code: 'DOCUMENTS_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to get documents',
        },
        timestamp: new Date().toISOString(),
      }, 500);
    }
  });

  // Cancel KYC workflow
  app.post('/kyc/cancel', async (c) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    try {
      // Mock temporal client check
      // In real implementation, would check for active workflows
      // For testing, we'll simulate based on whether we have a pending KYC record
      const kycRecord = await mockConvexQuery('kyc:getLatest', { userId });
      
      if (!kycRecord || kycRecord.status !== 'in_progress') {
        return c.json({
          success: false,
          error: {
            code: 'NO_ACTIVE_KYC',
            message: 'No active KYC workflow to cancel',
          },
          timestamp: new Date().toISOString(),
        }, 404);
      }

      // Would signal Temporal workflow in real implementation
      await mockConvexMutation('kyc:update', {
        id: kycRecord._id,
        status: 'cancelled',
      });

      return c.json({
        success: true,
        data: {
          message: 'KYC workflow cancelled',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return c.json({
        success: false,
        error: {
          code: 'KYC_CANCEL_FAILED',
          message: error instanceof Error ? error.message : 'Failed to cancel KYC',
        },
        timestamp: new Date().toISOString(),
      }, 500);
    }
  });

  // Upgrade KYC tier
  app.post('/kyc/upgrade', async (c) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }, 401);
    }

    try {
      const body = await c.req.json();
      const targetTier = body.targetTier;

      // Validate target tier
      const validUpgradeTiers = ['enhanced', 'accredited'];
      if (!validUpgradeTiers.includes(targetTier)) {
        return c.json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid target tier' },
        }, 400);
      }

      // Would start Temporal workflow in real implementation
      const workflowId = `kyc-upgrade-${userId}-${Date.now()}`;
      
      return c.json({
        success: true,
        data: {
          workflowId,
          status: 'in_progress',
          currentStep: 'persona_verification',
          progress: 25,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return c.json({
        success: false,
        error: {
          code: 'UPGRADE_START_FAILED',
          message: error instanceof Error ? error.message : 'Failed to start upgrade',
        },
        timestamp: new Date().toISOString(),
      }, 500);
    }
  });

  return app;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('KYC Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // Get Status Tests
  // =========================================================================

  describe('GET /kyc/status', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/kyc/status');

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return KYC status for new user', async () => {
      const app = createTestApp();

      mockConvexQuery
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(null);

      const res = await app.request('/kyc/status');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.kycStatus).toBe('pending');
      expect(body.data.kycTier).toBe('none');
      expect(body.data.currentInquiry).toBeNull();
      expect(body.data.canUpgrade).toBe(true);
    });

    it('should return KYC status with ongoing verification', async () => {
      const app = createTestApp();

      mockConvexQuery
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(mockKYCRecord);

      const res = await app.request('/kyc/status');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.currentInquiry).not.toBeNull();
      expect(body.data.currentInquiry.status).toBe('in_progress');
    });

    it('should return KYC status for verified user', async () => {
      const app = createTestApp();

      mockConvexQuery
        .mockResolvedValueOnce(mockVerifiedUser)
        .mockResolvedValueOnce(mockCompletedKYC);

      const res = await app.request('/kyc/status');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.kycStatus).toBe('approved');
      expect(body.data.kycTier).toBe('verified');
    });

    it('should return tier limits', async () => {
      const app = createTestApp();

      mockConvexQuery
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(null);

      const res = await app.request('/kyc/status');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.tiers).toHaveLength(4);
      expect(body.data.tiers[0].id).toBe('none');
      expect(body.data.tiers[2].id).toBe('verified');
    });

    it('should return 404 for non-existent user', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(null);

      const res = await app.request('/kyc/status');

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // Start KYC Tests
  // =========================================================================

  describe('POST /kyc/start', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/kyc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTier: 'basic' }),
      });

      expect(res.status).toBe(401);
    });

    it('should start basic KYC verification', async () => {
      const app = createTestApp();

      mockConvexQuery
        .mockResolvedValueOnce(null) // No existing KYC
        .mockResolvedValueOnce(mockUser);
      mockPersonaClient.createInquiry.mockResolvedValueOnce({
        inquiry: mockPersonaInquiry,
        sessionToken: 'session_token_mock123',
      });
      mockConvexMutation
        .mockResolvedValueOnce('kyc-new-001')
        .mockResolvedValueOnce({ success: true });

      const res = await app.request('/kyc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTier: 'basic' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.kycId).toBe('kyc-new-001');
      expect(body.data.sessionToken).toBeDefined();
      expect(body.data.targetTier).toBe('basic');
    });

    it('should use default tier when not specified', async () => {
      const app = createTestApp();

      mockConvexQuery
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockUser);
      mockPersonaClient.createInquiry.mockResolvedValueOnce({
        inquiry: mockPersonaInquiry,
        sessionToken: 'session_token_mock123',
      });
      mockConvexMutation
        .mockResolvedValueOnce('kyc-new-001')
        .mockResolvedValueOnce({ success: true });

      const res = await app.request('/kyc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.targetTier).toBe('basic');
    });

    it('should reject invalid target tier', async () => {
      const app = createTestApp();

      const res = await app.request('/kyc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTier: 'invalid_tier' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject when verification already in progress', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockKYCRecord);

      const res = await app.request('/kyc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTier: 'basic' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('KYC_IN_PROGRESS');
    });

    it('should reject when already at or above target tier', async () => {
      const app = createTestApp();

      mockConvexQuery
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockVerifiedUser);

      const res = await app.request('/kyc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTier: 'basic' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('ALREADY_VERIFIED');
    });

    it('should start verified tier KYC', async () => {
      const app = createTestApp();

      const basicUser = { ...mockUser, kycTier: 'basic', kycStatus: 'approved' };

      mockConvexQuery
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(basicUser);
      mockPersonaClient.createInquiry.mockResolvedValueOnce({
        inquiry: mockPersonaInquiry,
        sessionToken: 'session_token_mock123',
      });
      mockConvexMutation
        .mockResolvedValueOnce('kyc-new-002')
        .mockResolvedValueOnce({ success: true });

      const res = await app.request('/kyc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTier: 'verified' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.targetTier).toBe('verified');
    });
  });

  // =========================================================================
  // Resume KYC Tests
  // =========================================================================

  describe('POST /kyc/resume', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/kyc/resume', {
        method: 'POST',
      });

      expect(res.status).toBe(401);
    });

    it('should resume in-progress verification', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockKYCRecord);
      mockPersonaClient.resumeInquiry.mockResolvedValueOnce({
        inquiry: {
          ...mockPersonaInquiry,
          attributes: {
            ...mockPersonaInquiry.attributes,
            status: 'pending',
          },
        },
        sessionToken: 'session_token_resume_123',
      });

      const res = await app.request('/kyc/resume', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.sessionToken).toBe('session_token_resume_123');
    });

    it('should return 404 when no verification found', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(null);

      const res = await app.request('/kyc/resume', {
        method: 'POST',
      });

      expect(res.status).toBe(404);
    });

    it('should reject when verification not in progress', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockCompletedKYC);

      const res = await app.request('/kyc/resume', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_STATUS');
    });
  });

  // =========================================================================
  // Get Inquiry Status Tests
  // =========================================================================

  describe('GET /kyc/inquiry/:inquiryId', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/kyc/inquiry/inq_mock123');

      expect(res.status).toBe(401);
    });

    it('should return inquiry status', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockKYCRecord);
      mockPersonaClient.getInquiry.mockResolvedValueOnce(mockPersonaInquiry);

      const res = await app.request('/kyc/inquiry/inq_mock123');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.inquiryId).toBe('inq_mock123');
      expect(body.data.status).toBe('created');
    });

    it('should return 404 for non-matching inquiry', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(mockKYCRecord);

      const res = await app.request('/kyc/inquiry/inq_different');

      expect(res.status).toBe(404);
    });

    it('should return 404 when no KYC record', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce(null);

      const res = await app.request('/kyc/inquiry/inq_mock123');

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // Webhook Tests
  // =========================================================================

  describe('POST /kyc/webhook', () => {
    it('should reject without signature', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/kyc/webhook', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_SIGNATURE');
    });

    it('should process inquiry.approved event', async () => {
      const app = createTestApp({ authenticated: false });

      mockPersonaClient.verifyWebhook.mockReturnValueOnce({
        valid: true,
        data: {
          type: 'inquiry.approved',
          data: mockApprovedInquiry,
        },
      });
      mockConvexMutation
        .mockResolvedValueOnce({ success: true }) // kyc:update
        .mockResolvedValueOnce({ success: true }); // users:updateKYCStatus
      mockConvexQuery.mockResolvedValueOnce(mockKYCRecord);

      const res = await app.request('/kyc/webhook', {
        method: 'POST',
        headers: { 'persona-signature': 'valid_signature' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.received).toBe(true);

      expect(mockConvexMutation).toHaveBeenCalledWith('kyc:update', expect.objectContaining({
        status: 'approved',
      }));
    });

    it('should process inquiry.declined event', async () => {
      const app = createTestApp({ authenticated: false });

      mockPersonaClient.verifyWebhook.mockReturnValueOnce({
        valid: true,
        data: {
          type: 'inquiry.declined',
          data: {
            ...mockPersonaInquiry,
            attributes: {
              ...mockPersonaInquiry.attributes,
              status: 'declined',
              decline_reason: 'Document invalid',
            },
          },
        },
      });
      mockConvexMutation
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true });

      const res = await app.request('/kyc/webhook', {
        method: 'POST',
        headers: { 'persona-signature': 'valid_signature' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);

      expect(mockConvexMutation).toHaveBeenCalledWith('kyc:update', expect.objectContaining({
        status: 'rejected',
      }));
    });

    it('should reject invalid signature', async () => {
      const app = createTestApp({ authenticated: false });

      mockPersonaClient.verifyWebhook.mockReturnValueOnce({
        valid: false,
        data: null,
      });

      const res = await app.request('/kyc/webhook', {
        method: 'POST',
        headers: { 'persona-signature': 'invalid_signature' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_SIGNATURE');
    });

    it('should handle webhook verification error', async () => {
      const app = createTestApp({ authenticated: false });

      mockPersonaClient.verifyWebhook.mockImplementationOnce(() => {
        throw new Error('Verification failed');
      });

      const res = await app.request('/kyc/webhook', {
        method: 'POST',
        headers: { 'persona-signature': 'valid_signature' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('WEBHOOK_ERROR');
    });
  });

  // =========================================================================
  // Get History Tests
  // =========================================================================

  describe('GET /kyc/history', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/kyc/history');

      expect(res.status).toBe(401);
    });

    it('should return KYC history', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([mockKYCRecord, mockCompletedKYC]);

      const res = await app.request('/kyc/history');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
    });

    it('should return empty array for new user', async () => {
      const app = createTestApp();

      mockConvexQuery.mockResolvedValueOnce([]);

      const res = await app.request('/kyc/history');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });
  });

  // =========================================================================
  // Get Documents Tests
  // =========================================================================

  describe('GET /kyc/documents', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/kyc/documents');

      expect(res.status).toBe(401);
    });

    it('should return documents for latest inquiry', async () => {
      const app = createTestApp();

      const mockDocuments = {
        documents: [
          {
            id: 'doc-001',
            attributes: {
              kind: 'government_id',
              status: 'processed',
              created_at: '2024-01-01T10:00:00Z',
              processed_at: '2024-01-01T10:05:00Z',
              files: [
                {
                  id: 'file-001',
                  filename: 'id_front.jpg',
                  page: 0,
                  url: 'https://example.com/file-001',
                  byte_size: 102400,
                },
              ],
            },
          },
        ],
        selfies: [
          {
            id: 'selfie-001',
            attributes: {
              status: 'processed',
              capture_method: 'video',
              created_at: '2024-01-01T10:10:00Z',
              processed_at: '2024-01-01T10:15:00Z',
              center_photo_url: 'https://example.com/selfie-center',
              left_photo_url: 'https://example.com/selfie-left',
              right_photo_url: 'https://example.com/selfie-right',
            },
          },
        ],
      };

      mockPersonaClient.getLatestInquiryByReferenceId.mockResolvedValueOnce(mockPersonaInquiry);
      mockPersonaClient.getInquiryFiles.mockResolvedValueOnce(mockDocuments);
      mockPersonaClient.getVerifications.mockResolvedValueOnce([]);

      const res = await app.request('/kyc/documents');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.documents).toHaveLength(1);
      expect(body.data.selfies).toHaveLength(1);
      expect(body.data.documents[0].kind).toBe('government_id');
    });

    it('should return empty documents for new user', async () => {
      const app = createTestApp();

      mockPersonaClient.getLatestInquiryByReferenceId.mockResolvedValueOnce(null);

      const res = await app.request('/kyc/documents');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.documents).toEqual([]);
      expect(body.data.selfies).toEqual([]);
    });

    it('should return documents for specific inquiry ID', async () => {
      const app = createTestApp();

      const mockDocuments = {
        documents: [],
        selfies: [],
      };

      mockPersonaClient.getInquiryFiles.mockResolvedValueOnce(mockDocuments);
      mockPersonaClient.getVerifications.mockResolvedValueOnce([]);

      const res = await app.request('/kyc/documents?inquiryId=inq_123');

      expect(res.status).toBe(200);
      expect(mockPersonaClient.getInquiryFiles).toHaveBeenCalledWith('inq_123');
    });

    it('should handle document fetch errors gracefully', async () => {
      const app = createTestApp();

      mockPersonaClient.getLatestInquiryByReferenceId.mockRejectedValueOnce(
        new Error('API error')
      );

      const res = await app.request('/kyc/documents');

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('DOCUMENTS_FETCH_FAILED');
    });
  });

  // =========================================================================
  // Cancel KYC Tests
  // =========================================================================

  describe('POST /kyc/cancel', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/kyc/cancel', {
        method: 'POST',
      });

      expect(res.status).toBe(401);
    });

    it('should cancel active KYC workflow', async () => {
      const app = createTestApp();

      // Mock an active KYC record
      mockConvexQuery.mockResolvedValueOnce(mockKYCRecord);
      mockConvexMutation.mockResolvedValueOnce({ success: true });

      const res = await app.request('/kyc/cancel', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toContain('cancelled');
      expect(body.timestamp).toBeDefined();
    });

    it('should return 404 when no active workflow exists', async () => {
      const app = createTestApp();

      // Mock no KYC record
      mockConvexQuery.mockResolvedValueOnce(null);

      const res = await app.request('/kyc/cancel', {
        method: 'POST',
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NO_ACTIVE_KYC');
    });

    it('should return 404 when KYC is not in progress', async () => {
      const app = createTestApp();

      // Mock completed KYC record
      mockConvexQuery.mockResolvedValueOnce(mockCompletedKYC);

      const res = await app.request('/kyc/cancel', {
        method: 'POST',
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NO_ACTIVE_KYC');
    });

    it('should handle errors gracefully', async () => {
      const app = createTestApp();

      mockConvexQuery.mockRejectedValueOnce(new Error('Database error'));

      const res = await app.request('/kyc/cancel', {
        method: 'POST',
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('KYC_CANCEL_FAILED');
    });
  });

  // =========================================================================
  // Upgrade KYC Tests
  // =========================================================================

  describe('POST /kyc/upgrade', () => {
    it('should reject without authentication', async () => {
      const app = createTestApp({ authenticated: false });

      const res = await app.request('/kyc/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTier: 'enhanced' }),
      });

      expect(res.status).toBe(401);
    });

    it('should start upgrade workflow to enhanced tier', async () => {
      const app = createTestApp();

      const res = await app.request('/kyc/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetTier: 'enhanced',
          requireBankLink: true,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('in_progress');
      expect(body.data.workflowId).toContain('kyc-upgrade');
      expect(body.timestamp).toBeDefined();
    });

    it('should start upgrade workflow to accredited tier', async () => {
      const app = createTestApp();

      const res = await app.request('/kyc/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTier: 'accredited' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.workflowId).toContain('kyc-upgrade');
    });

    it('should reject invalid target tier', async () => {
      const app = createTestApp();

      const res = await app.request('/kyc/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTier: 'basic' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle errors gracefully', async () => {
      const app = createTestApp();

      // Force a JSON parse error by sending invalid JSON
      const res = await app.request('/kyc/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UPGRADE_START_FAILED');
    });

    it('should include timestamp in response', async () => {
      const app = createTestApp();

      const res = await app.request('/kyc/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTier: 'enhanced' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.timestamp).toBeDefined();
      expect(typeof body.timestamp).toBe('string');
    });
  });
});

// ===========================================================================
// KYC Tier Tests
// ===========================================================================

describe('KYC Tier Logic', () => {
  describe('Tier Hierarchy', () => {
    const tiers = ['none', 'basic', 'verified', 'premium', 'institutional'];

    it('should correctly order tiers', () => {
      expect(tiers.indexOf('none')).toBeLessThan(tiers.indexOf('basic'));
      expect(tiers.indexOf('basic')).toBeLessThan(tiers.indexOf('verified'));
      expect(tiers.indexOf('verified')).toBeLessThan(tiers.indexOf('premium'));
      expect(tiers.indexOf('premium')).toBeLessThan(tiers.indexOf('institutional'));
    });

    it('should determine if upgrade is needed', () => {
      const needsUpgrade = (current: string, target: string): boolean => {
        return tiers.indexOf(current) < tiers.indexOf(target);
      };

      expect(needsUpgrade('none', 'basic')).toBe(true);
      expect(needsUpgrade('basic', 'verified')).toBe(true);
      expect(needsUpgrade('verified', 'basic')).toBe(false);
      expect(needsUpgrade('premium', 'verified')).toBe(false);
    });
  });

  describe('Tier Limits', () => {
    const limits = {
      none: { daily: 0, monthly: 0 },
      basic: { daily: 1000, monthly: 10000 },
      verified: { daily: 10000, monthly: 100000 },
      premium: { daily: 100000, monthly: 1000000 },
      institutional: { daily: Infinity, monthly: Infinity },
    };

    it('should have correct daily limits', () => {
      expect(limits.none.daily).toBe(0);
      expect(limits.basic.daily).toBe(1000);
      expect(limits.verified.daily).toBe(10000);
      expect(limits.premium.daily).toBe(100000);
    });

    it('should check transaction limit', () => {
      const isWithinLimit = (tier: string, amount: number, type: 'daily' | 'monthly'): boolean => {
        const tierLimits = limits[tier as keyof typeof limits];
        return amount <= tierLimits[type];
      };

      expect(isWithinLimit('basic', 500, 'daily')).toBe(true);
      expect(isWithinLimit('basic', 5000, 'daily')).toBe(false);
      expect(isWithinLimit('verified', 5000, 'daily')).toBe(true);
    });
  });
});
