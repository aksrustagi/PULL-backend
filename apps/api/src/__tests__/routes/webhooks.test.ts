import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import * as crypto from 'crypto';

// Mock logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => mockLogger),
};

vi.mock('@pull/core/services', () => ({
  getLogger: vi.fn(() => mockLogger),
}));

// Mock Convex client
const mockConvexMutation = vi.fn();
const mockConvexQuery = vi.fn();

vi.mock('convex/browser', () => ({
  ConvexHttpClient: vi.fn(() => ({
    mutation: mockConvexMutation,
    query: mockConvexQuery,
  })),
}));

// Mock Convex API
vi.mock('@pull/db/convex/_generated/api', () => ({
  api: {
    kyc: {
      storeWebhookEvent: 'kyc:storeWebhookEvent',
      updateKYCStatus: 'kyc:updateKYCStatus',
      markWebhookProcessed: 'kyc:markWebhookProcessed',
    },
    payments: {
      completeDepositByExternalId: 'payments:completeDepositByExternalId',
      failDepositByExternalId: 'payments:failDepositByExternalId',
      completeWithdrawalByPayoutId: 'payments:completeWithdrawalByPayoutId',
      failWithdrawalByPayoutId: 'payments:failWithdrawalByPayoutId',
      markConnectedAccountReady: 'payments:markConnectedAccountReady',
    },
  },
}));

// Mock Persona client
const mockPersonaClient = {
  getInquiryWithVerifications: vi.fn(),
};

vi.mock('@pull/core/services/persona', () => ({
  PersonaClient: vi.fn(() => mockPersonaClient),
}));

// Mock Stripe webhook handler
const mockStripeWebhookHandler = {
  processWebhook: vi.fn(),
};

vi.mock('@pull/core/services/stripe', () => ({
  initializeWebhookHandler: vi.fn(() => mockStripeWebhookHandler),
}));

// Helper function to create HMAC signature
function createHmacSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// Helper function to create Persona-style signature
function createPersonaSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('Webhooks Routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PERSONA_WEBHOOK_SECRET = 'persona-test-secret';
    process.env.STRIPE_WEBHOOK_SECRET = 'stripe-test-secret';
    process.env.POLYGON_WEBHOOK_SECRET = 'polygon-test-secret';
    process.env.CHECKR_WEBHOOK_SECRET = 'checkr-test-secret';
    process.env.CONVEX_URL = 'https://test.convex.cloud';
    process.env.PERSONA_API_KEY = 'persona-api-key';
  });

  describe('Stripe Webhooks', () => {
    beforeEach(async () => {
      vi.resetModules();
      const { webhookRoutes } = await import('../../routes/webhooks');
      app = new Hono();
      app.route('/webhooks', webhookRoutes);
    });

    describe('Signature Verification', () => {
      it('should reject webhook without signature', async () => {
        const payload = JSON.stringify({ type: 'checkout.session.completed' });

        const res = await app.request('/webhooks/stripe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data).toHaveProperty('error');
      });

      it('should reject webhook with invalid signature', async () => {
        const payload = JSON.stringify({ type: 'checkout.session.completed' });
        mockStripeWebhookHandler.processWebhook.mockResolvedValueOnce({
          success: false,
          error: 'Invalid signature',
          eventType: 'checkout.session.completed',
        });

        const res = await app.request('/webhooks/stripe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Stripe-Signature': 'invalid-signature',
          },
          body: payload,
        });

        expect(res.status).toBe(401);
      });

      it('should accept webhook with valid signature', async () => {
        const payload = JSON.stringify({ type: 'checkout.session.completed' });
        mockStripeWebhookHandler.processWebhook.mockResolvedValueOnce({
          success: true,
          processed: true,
          eventId: 'evt_123',
          eventType: 'checkout.session.completed',
        });

        const res = await app.request('/webhooks/stripe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Stripe-Signature': 'valid-signature',
          },
          body: payload,
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toMatchObject({
          received: true,
          processed: true,
        });
      });
    });

    describe('checkout.session.completed', () => {
      it('should process deposit completion', async () => {
        mockConvexMutation.mockResolvedValue('deposit_123');
        mockStripeWebhookHandler.processWebhook.mockImplementation(async () => {
          // Simulate calling onDepositCompleted
          const handler = vi.mocked(await import('@pull/core/services/stripe')).initializeWebhookHandler.mock.calls[0][0];
          await handler.onDepositCompleted({
            userId: 'user_123',
            netAmount: 10000,
            sessionId: 'cs_123',
            paymentIntentId: 'pi_123',
            customerId: 'cus_123',
          });

          return {
            success: true,
            processed: true,
            eventId: 'evt_123',
            eventType: 'checkout.session.completed',
          };
        });

        const payload = JSON.stringify({
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_123' } },
        });

        const res = await app.request('/webhooks/stripe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Stripe-Signature': 'valid-signature',
          },
          body: payload,
        });

        expect(res.status).toBe(200);
        expect(mockConvexMutation).toHaveBeenCalled();
      });
    });

    describe('payout.paid', () => {
      it('should mark withdrawal as complete', async () => {
        mockConvexMutation.mockResolvedValue(undefined);
        mockStripeWebhookHandler.processWebhook.mockImplementation(async () => {
          const handler = vi.mocked(await import('@pull/core/services/stripe')).initializeWebhookHandler.mock.calls[0][0];
          await handler.onPayoutPaid({
            payoutId: 'po_123',
            amount: 5000,
          });

          return {
            success: true,
            processed: true,
            eventId: 'evt_124',
            eventType: 'payout.paid',
          };
        });

        const payload = JSON.stringify({
          type: 'payout.paid',
          data: { object: { id: 'po_123' } },
        });

        const res = await app.request('/webhooks/stripe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Stripe-Signature': 'valid-signature',
          },
          body: payload,
        });

        expect(res.status).toBe(200);
      });
    });

    describe('payout.failed', () => {
      it('should handle withdrawal failure', async () => {
        mockConvexMutation.mockResolvedValue(undefined);
        mockStripeWebhookHandler.processWebhook.mockImplementation(async () => {
          const handler = vi.mocked(await import('@pull/core/services/stripe')).initializeWebhookHandler.mock.calls[0][0];
          await handler.onPayoutFailed({
            payoutId: 'po_123',
            failureCode: 'insufficient_funds',
            failureMessage: 'Insufficient funds in account',
          });

          return {
            success: true,
            processed: true,
            eventId: 'evt_125',
            eventType: 'payout.failed',
          };
        });

        const payload = JSON.stringify({
          type: 'payout.failed',
          data: { object: { id: 'po_123' } },
        });

        const res = await app.request('/webhooks/stripe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Stripe-Signature': 'valid-signature',
          },
          body: payload,
        });

        expect(res.status).toBe(200);
      });
    });

    describe('account.updated', () => {
      it('should update connected account status', async () => {
        mockConvexMutation.mockResolvedValue(undefined);
        mockStripeWebhookHandler.processWebhook.mockImplementation(async () => {
          const handler = vi.mocked(await import('@pull/core/services/stripe')).initializeWebhookHandler.mock.calls[0][0];
          await handler.onAccountUpdated({
            accountId: 'acct_123',
            payoutsEnabled: true,
            detailsSubmitted: true,
          });

          return {
            success: true,
            processed: true,
            eventId: 'evt_126',
            eventType: 'account.updated',
          };
        });

        const payload = JSON.stringify({
          type: 'account.updated',
          data: { object: { id: 'acct_123' } },
        });

        const res = await app.request('/webhooks/stripe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Stripe-Signature': 'valid-signature',
          },
          body: payload,
        });

        expect(res.status).toBe(200);
      });
    });

    describe('Webhook Event Storage', () => {
      it('should store webhook events for audit', async () => {
        mockStripeWebhookHandler.processWebhook.mockResolvedValueOnce({
          success: true,
          processed: true,
          eventId: 'evt_123',
          eventType: 'checkout.session.completed',
        });

        const payload = JSON.stringify({
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_123' } },
        });

        const res = await app.request('/webhooks/stripe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Stripe-Signature': 'valid-signature',
          },
          body: payload,
        });

        expect(res.status).toBe(200);
      });
    });
  });

  describe('Persona Webhooks', () => {
    beforeEach(async () => {
      vi.resetModules();
      const { webhookRoutes } = await import('../../routes/webhooks');
      app = new Hono();
      app.route('/webhooks', webhookRoutes);
    });

    describe('Signature Verification', () => {
      it('should reject webhook with invalid signature', async () => {
        const payload = JSON.stringify({
          data: {
            type: 'inquiry.completed',
            attributes: {
              payload: {
                data: {
                  type: 'inquiry',
                  id: 'inq_123',
                  attributes: { reference_id: 'user_123' },
                },
              },
            },
          },
        });

        const res = await app.request('/webhooks/persona', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Persona-Signature': 'invalid-signature',
          },
          body: payload,
        });

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data).toHaveProperty('error');
      });

      it('should accept webhook with valid Persona signature', async () => {
        mockConvexMutation.mockResolvedValue('webhook_123');
        mockPersonaClient.getInquiryWithVerifications.mockResolvedValue({
          inquiry: {
            id: 'inq_123',
            attributes: { status: 'completed', reference_id: 'user_123' },
          },
          verifications: [
            { attributes: { status: 'passed' } },
          ],
        });

        const payload = JSON.stringify({
          data: {
            type: 'inquiry.completed',
            attributes: {
              payload: {
                data: {
                  type: 'inquiry',
                  id: 'inq_123',
                  attributes: { reference_id: 'user_123', status: 'completed' },
                },
              },
            },
          },
        });

        const signature = createPersonaSignature(payload, 'persona-test-secret');

        const res = await app.request('/webhooks/persona', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Persona-Signature': signature,
          },
          body: payload,
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('received', true);
      });

      it('should reject webhook with expired timestamp', async () => {
        const payload = JSON.stringify({
          data: {
            type: 'inquiry.completed',
            attributes: {
              payload: {
                data: {
                  type: 'inquiry',
                  id: 'inq_123',
                  attributes: { reference_id: 'user_123' },
                },
              },
            },
          },
        });

        // Create signature with old timestamp (more than 5 minutes old)
        const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago
        const signedPayload = `${oldTimestamp}.${payload}`;
        const signature = crypto.createHmac('sha256', 'persona-test-secret')
          .update(signedPayload)
          .digest('hex');
        const personaSignature = `t=${oldTimestamp},v1=${signature}`;

        const res = await app.request('/webhooks/persona', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Persona-Signature': personaSignature,
          },
          body: payload,
        });

        expect(res.status).toBe(401);
      });
    });

    describe('inquiry.completed', () => {
      it('should update KYC status to in_progress', async () => {
        mockConvexMutation.mockResolvedValue('webhook_123');
        mockPersonaClient.getInquiryWithVerifications.mockResolvedValue({
          inquiry: {
            id: 'inq_123',
            attributes: { status: 'completed', reference_id: 'user_123' },
          },
          verifications: [
            { attributes: { status: 'passed' } },
          ],
        });

        const payload = JSON.stringify({
          data: {
            type: 'inquiry.completed',
            attributes: {
              payload: {
                data: {
                  type: 'inquiry',
                  id: 'inq_123',
                  attributes: { reference_id: 'user_123', status: 'completed' },
                },
              },
            },
          },
        });

        const signature = createPersonaSignature(payload, 'persona-test-secret');

        const res = await app.request('/webhooks/persona', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Persona-Signature': signature,
          },
          body: payload,
        });

        expect(res.status).toBe(200);
        expect(mockConvexMutation).toHaveBeenCalledWith(
          'kyc:updateKYCStatus',
          expect.objectContaining({
            userId: 'user_123',
            status: 'in_progress',
          })
        );
      });
    });

    describe('inquiry.approved', () => {
      it('should update KYC status to approved', async () => {
        mockConvexMutation.mockResolvedValue('webhook_123');

        const payload = JSON.stringify({
          data: {
            type: 'inquiry.approved',
            attributes: {
              payload: {
                data: {
                  type: 'inquiry',
                  id: 'inq_123',
                  attributes: {
                    reference_id: 'user_123',
                    status: 'approved',
                    tags: ['basic'],
                  },
                },
              },
            },
          },
        });

        const signature = createPersonaSignature(payload, 'persona-test-secret');

        const res = await app.request('/webhooks/persona', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Persona-Signature': signature,
          },
          body: payload,
        });

        expect(res.status).toBe(200);
        expect(mockConvexMutation).toHaveBeenCalledWith(
          'kyc:updateKYCStatus',
          expect.objectContaining({
            userId: 'user_123',
            status: 'approved',
            tier: 'basic',
          })
        );
      });
    });

    describe('inquiry.declined', () => {
      it('should handle KYC rejection', async () => {
        mockConvexMutation.mockResolvedValue('webhook_123');

        const payload = JSON.stringify({
          data: {
            type: 'inquiry.declined',
            attributes: {
              payload: {
                data: {
                  type: 'inquiry',
                  id: 'inq_123',
                  attributes: {
                    reference_id: 'user_123',
                    status: 'declined',
                    reviewer_comment: 'Document quality too low',
                  },
                },
              },
            },
          },
        });

        const signature = createPersonaSignature(payload, 'persona-test-secret');

        const res = await app.request('/webhooks/persona', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Persona-Signature': signature,
          },
          body: payload,
        });

        expect(res.status).toBe(200);
        expect(mockConvexMutation).toHaveBeenCalledWith(
          'kyc:updateKYCStatus',
          expect.objectContaining({
            userId: 'user_123',
            status: 'rejected',
            rejectionReason: 'Document quality too low',
          })
        );
      });
    });
  });

  describe('Polygon Webhooks', () => {
    beforeEach(async () => {
      vi.resetModules();
      const { webhookRoutes } = await import('../../routes/webhooks');
      app = new Hono();
      app.route('/webhooks', webhookRoutes);
    });

    describe('Signature Verification', () => {
      it('should reject webhook with invalid signature', async () => {
        const payload = JSON.stringify({
          event: 'token.transfer',
          transactionHash: '0x123',
        });

        const res = await app.request('/webhooks/polygon', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Polygon-Signature': 'invalid-signature',
          },
          body: payload,
        });

        expect(res.status).toBe(401);
      });

      it('should accept webhook with valid signature', async () => {
        mockConvexMutation.mockResolvedValue('webhook_123');

        const payload = JSON.stringify({
          event: 'token.transfer',
          transactionHash: '0x123',
        });

        const signature = createHmacSignature(payload, 'polygon-test-secret');

        const res = await app.request('/webhooks/polygon', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Polygon-Signature': signature,
          },
          body: payload,
        });

        expect(res.status).toBe(202); // Accepted but not processed
        const data = await res.json();
        expect(data).toMatchObject({
          received: true,
          processed: false,
        });
      });
    });

    it('should acknowledge events but not process them', async () => {
      mockConvexMutation.mockResolvedValue('webhook_123');

      const payload = JSON.stringify({
        event: 'token.transfer',
        transactionHash: '0xabc123',
      });

      const signature = createHmacSignature(payload, 'polygon-test-secret');

      const res = await app.request('/webhooks/polygon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Polygon-Signature': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data).toHaveProperty('message');
      expect(data.message).toContain('not yet implemented');
    });

    it('should store events for audit', async () => {
      mockConvexMutation.mockResolvedValue('webhook_123');

      const payload = JSON.stringify({
        event: 'token.mint',
        transactionHash: '0xdef456',
      });

      const signature = createHmacSignature(payload, 'polygon-test-secret');

      const res = await app.request('/webhooks/polygon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Polygon-Signature': signature,
        },
        body: payload,
      });

      expect(res.status).toBe(202);
      expect(mockConvexMutation).toHaveBeenCalledWith(
        'kyc:storeWebhookEvent',
        expect.objectContaining({
          source: 'polygon',
          eventType: 'token.mint',
        })
      );
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      vi.resetModules();
      const { webhookRoutes } = await import('../../routes/webhooks');
      app = new Hono();
      app.route('/webhooks', webhookRoutes);
    });

    it('should handle missing webhook secret configuration', async () => {
      delete process.env.PERSONA_WEBHOOK_SECRET;

      const payload = JSON.stringify({ data: { type: 'test' } });

      const res = await app.request('/webhooks/persona', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Persona-Signature': 'some-signature',
        },
        body: payload,
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toHaveProperty('error');
    });

    it('should handle Convex mutation failures gracefully', async () => {
      mockConvexMutation.mockRejectedValue(new Error('Database error'));
      mockPersonaClient.getInquiryWithVerifications.mockResolvedValue({
        inquiry: {
          id: 'inq_123',
          attributes: { status: 'completed', reference_id: 'user_123' },
        },
        verifications: [],
      });

      const payload = JSON.stringify({
        data: {
          type: 'inquiry.completed',
          attributes: {
            payload: {
              data: {
                type: 'inquiry',
                id: 'inq_123',
                attributes: { reference_id: 'user_123', status: 'completed' },
              },
            },
          },
        },
      });

      const signature = createPersonaSignature(payload, 'persona-test-secret');

      const res = await app.request('/webhooks/persona', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Persona-Signature': signature,
        },
        body: payload,
      });

      // Should still return 200 to prevent retries
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('received', true);
    });
  });
});
