/**
 * Stripe Service Tests
 * Tests for payment processing functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// ===========================================================================
// Mock Setup
// ===========================================================================

const mockStripeClient = {
  customers: {
    create: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
    del: vi.fn(),
    list: vi.fn(),
  },
  paymentIntents: {
    create: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    capture: vi.fn(),
  },
  paymentMethods: {
    create: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    list: vi.fn(),
    retrieve: vi.fn(),
  },
  refunds: {
    create: vi.fn(),
    retrieve: vi.fn(),
  },
  transfers: {
    create: vi.fn(),
    retrieve: vi.fn(),
    list: vi.fn(),
  },
  payouts: {
    create: vi.fn(),
    retrieve: vi.fn(),
    cancel: vi.fn(),
  },
  webhooks: {
    constructEvent: vi.fn(),
  },
};

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => mockStripeClient),
}));

// ===========================================================================
// Test Fixtures
// ===========================================================================

const mockCustomer = {
  id: 'cus_mock123',
  email: 'test@example.com',
  name: 'Test User',
  metadata: {
    userId: 'user_123',
  },
  created: Math.floor(Date.now() / 1000),
  livemode: false,
};

const mockPaymentIntent = {
  id: 'pi_mock123',
  amount: 10000, // $100.00
  currency: 'usd',
  status: 'requires_payment_method',
  client_secret: 'pi_mock123_secret_mock',
  customer: 'cus_mock123',
  metadata: {
    userId: 'user_123',
    type: 'deposit',
  },
  created: Math.floor(Date.now() / 1000),
};

const mockPaymentMethod = {
  id: 'pm_mock123',
  type: 'card',
  card: {
    brand: 'visa',
    last4: '4242',
    exp_month: 12,
    exp_year: 2025,
    funding: 'credit',
  },
  customer: 'cus_mock123',
  created: Math.floor(Date.now() / 1000),
};

const mockRefund = {
  id: 'ref_mock123',
  amount: 5000, // $50.00
  charge: 'ch_mock123',
  payment_intent: 'pi_mock123',
  status: 'succeeded',
  created: Math.floor(Date.now() / 1000),
};

// ===========================================================================
// Stripe Service Implementation (for testing)
// ===========================================================================

class StripeService {
  private stripe = mockStripeClient;

  async createCustomer(params: {
    email: string;
    name?: string;
    userId: string;
  }) {
    return this.stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: { userId: params.userId },
    });
  }

  async getCustomer(customerId: string) {
    return this.stripe.customers.retrieve(customerId);
  }

  async updateCustomer(customerId: string, params: { email?: string; name?: string }) {
    return this.stripe.customers.update(customerId, params);
  }

  async deleteCustomer(customerId: string) {
    return this.stripe.customers.del(customerId);
  }

  async createPaymentIntent(params: {
    amount: number;
    currency?: string;
    customerId?: string;
    metadata?: Record<string, string>;
  }) {
    if (params.amount <= 0) {
      throw new Error('Amount must be positive');
    }

    if (params.amount < 50) {
      throw new Error('Amount must be at least $0.50');
    }

    return this.stripe.paymentIntents.create({
      amount: params.amount,
      currency: params.currency || 'usd',
      customer: params.customerId,
      metadata: params.metadata,
    });
  }

  async getPaymentIntent(paymentIntentId: string) {
    return this.stripe.paymentIntents.retrieve(paymentIntentId);
  }

  async confirmPaymentIntent(paymentIntentId: string, paymentMethodId: string) {
    return this.stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
    });
  }

  async cancelPaymentIntent(paymentIntentId: string) {
    return this.stripe.paymentIntents.cancel(paymentIntentId);
  }

  async capturePaymentIntent(paymentIntentId: string, amount?: number) {
    return this.stripe.paymentIntents.capture(paymentIntentId, {
      amount_to_capture: amount,
    });
  }

  async attachPaymentMethod(paymentMethodId: string, customerId: string) {
    return this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  }

  async detachPaymentMethod(paymentMethodId: string) {
    return this.stripe.paymentMethods.detach(paymentMethodId);
  }

  async listPaymentMethods(customerId: string, type: string = 'card') {
    return this.stripe.paymentMethods.list({
      customer: customerId,
      type,
    });
  }

  async createRefund(params: {
    paymentIntentId: string;
    amount?: number;
    reason?: string;
  }) {
    return this.stripe.refunds.create({
      payment_intent: params.paymentIntentId,
      amount: params.amount,
      reason: params.reason as 'duplicate' | 'fraudulent' | 'requested_by_customer',
    });
  }

  async createPayout(params: {
    amount: number;
    currency?: string;
    destination?: string;
  }) {
    if (params.amount <= 0) {
      throw new Error('Amount must be positive');
    }

    return this.stripe.payouts.create({
      amount: params.amount,
      currency: params.currency || 'usd',
      destination: params.destination,
    });
  }

  async cancelPayout(payoutId: string) {
    return this.stripe.payouts.cancel(payoutId);
  }

  constructWebhookEvent(payload: string, signature: string, secret: string) {
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }

  calculateFee(amount: number, feeRate: number = 0.029, fixedFee: number = 30): number {
    // Stripe's standard fee: 2.9% + $0.30
    return Math.round(amount * feeRate + fixedFee);
  }

  calculateNetAmount(amount: number): number {
    const fee = this.calculateFee(amount);
    return amount - fee;
  }
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Stripe Service', () => {
  let stripeService: StripeService;

  beforeAll(() => {
    stripeService = new StripeService();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // Customer Management Tests
  // =========================================================================

  describe('Customer Management', () => {
    describe('createCustomer', () => {
      it('should create a customer successfully', async () => {
        mockStripeClient.customers.create.mockResolvedValueOnce(mockCustomer);

        const result = await stripeService.createCustomer({
          email: 'test@example.com',
          name: 'Test User',
          userId: 'user_123',
        });

        expect(result.id).toBe('cus_mock123');
        expect(result.email).toBe('test@example.com');
        expect(mockStripeClient.customers.create).toHaveBeenCalledWith({
          email: 'test@example.com',
          name: 'Test User',
          metadata: { userId: 'user_123' },
        });
      });

      it('should create customer without name', async () => {
        mockStripeClient.customers.create.mockResolvedValueOnce({
          ...mockCustomer,
          name: null,
        });

        const result = await stripeService.createCustomer({
          email: 'test@example.com',
          userId: 'user_123',
        });

        expect(result.id).toBe('cus_mock123');
        expect(mockStripeClient.customers.create).toHaveBeenCalledWith({
          email: 'test@example.com',
          name: undefined,
          metadata: { userId: 'user_123' },
        });
      });
    });

    describe('getCustomer', () => {
      it('should retrieve a customer', async () => {
        mockStripeClient.customers.retrieve.mockResolvedValueOnce(mockCustomer);

        const result = await stripeService.getCustomer('cus_mock123');

        expect(result.id).toBe('cus_mock123');
        expect(mockStripeClient.customers.retrieve).toHaveBeenCalledWith('cus_mock123');
      });
    });

    describe('updateCustomer', () => {
      it('should update customer email', async () => {
        mockStripeClient.customers.update.mockResolvedValueOnce({
          ...mockCustomer,
          email: 'newemail@example.com',
        });

        const result = await stripeService.updateCustomer('cus_mock123', {
          email: 'newemail@example.com',
        });

        expect(result.email).toBe('newemail@example.com');
        expect(mockStripeClient.customers.update).toHaveBeenCalledWith('cus_mock123', {
          email: 'newemail@example.com',
        });
      });
    });

    describe('deleteCustomer', () => {
      it('should delete a customer', async () => {
        mockStripeClient.customers.del.mockResolvedValueOnce({
          id: 'cus_mock123',
          deleted: true,
        });

        const result = await stripeService.deleteCustomer('cus_mock123');

        expect(result.deleted).toBe(true);
        expect(mockStripeClient.customers.del).toHaveBeenCalledWith('cus_mock123');
      });
    });
  });

  // =========================================================================
  // Payment Intent Tests
  // =========================================================================

  describe('Payment Intent Management', () => {
    describe('createPaymentIntent', () => {
      it('should create a payment intent', async () => {
        mockStripeClient.paymentIntents.create.mockResolvedValueOnce(mockPaymentIntent);

        const result = await stripeService.createPaymentIntent({
          amount: 10000,
          customerId: 'cus_mock123',
          metadata: { userId: 'user_123', type: 'deposit' },
        });

        expect(result.id).toBe('pi_mock123');
        expect(result.amount).toBe(10000);
        expect(result.client_secret).toBeDefined();
      });

      it('should use default currency', async () => {
        mockStripeClient.paymentIntents.create.mockResolvedValueOnce(mockPaymentIntent);

        await stripeService.createPaymentIntent({ amount: 10000 });

        expect(mockStripeClient.paymentIntents.create).toHaveBeenCalledWith(
          expect.objectContaining({ currency: 'usd' })
        );
      });

      it('should reject zero amount', async () => {
        await expect(
          stripeService.createPaymentIntent({ amount: 0 })
        ).rejects.toThrow('Amount must be positive');
      });

      it('should reject negative amount', async () => {
        await expect(
          stripeService.createPaymentIntent({ amount: -100 })
        ).rejects.toThrow('Amount must be positive');
      });

      it('should reject amount below minimum', async () => {
        await expect(
          stripeService.createPaymentIntent({ amount: 49 })
        ).rejects.toThrow('Amount must be at least $0.50');
      });
    });

    describe('confirmPaymentIntent', () => {
      it('should confirm a payment intent', async () => {
        mockStripeClient.paymentIntents.confirm.mockResolvedValueOnce({
          ...mockPaymentIntent,
          status: 'succeeded',
        });

        const result = await stripeService.confirmPaymentIntent('pi_mock123', 'pm_mock123');

        expect(result.status).toBe('succeeded');
        expect(mockStripeClient.paymentIntents.confirm).toHaveBeenCalledWith('pi_mock123', {
          payment_method: 'pm_mock123',
        });
      });
    });

    describe('cancelPaymentIntent', () => {
      it('should cancel a payment intent', async () => {
        mockStripeClient.paymentIntents.cancel.mockResolvedValueOnce({
          ...mockPaymentIntent,
          status: 'canceled',
        });

        const result = await stripeService.cancelPaymentIntent('pi_mock123');

        expect(result.status).toBe('canceled');
      });
    });

    describe('capturePaymentIntent', () => {
      it('should capture full amount', async () => {
        mockStripeClient.paymentIntents.capture.mockResolvedValueOnce({
          ...mockPaymentIntent,
          status: 'succeeded',
        });

        const result = await stripeService.capturePaymentIntent('pi_mock123');

        expect(result.status).toBe('succeeded');
      });

      it('should capture partial amount', async () => {
        mockStripeClient.paymentIntents.capture.mockResolvedValueOnce({
          ...mockPaymentIntent,
          amount: 5000,
          status: 'succeeded',
        });

        const result = await stripeService.capturePaymentIntent('pi_mock123', 5000);

        expect(mockStripeClient.paymentIntents.capture).toHaveBeenCalledWith('pi_mock123', {
          amount_to_capture: 5000,
        });
      });
    });
  });

  // =========================================================================
  // Payment Method Tests
  // =========================================================================

  describe('Payment Method Management', () => {
    describe('attachPaymentMethod', () => {
      it('should attach a payment method to customer', async () => {
        mockStripeClient.paymentMethods.attach.mockResolvedValueOnce(mockPaymentMethod);

        const result = await stripeService.attachPaymentMethod('pm_mock123', 'cus_mock123');

        expect(result.customer).toBe('cus_mock123');
        expect(mockStripeClient.paymentMethods.attach).toHaveBeenCalledWith('pm_mock123', {
          customer: 'cus_mock123',
        });
      });
    });

    describe('detachPaymentMethod', () => {
      it('should detach a payment method', async () => {
        mockStripeClient.paymentMethods.detach.mockResolvedValueOnce({
          ...mockPaymentMethod,
          customer: null,
        });

        const result = await stripeService.detachPaymentMethod('pm_mock123');

        expect(result.customer).toBeNull();
      });
    });

    describe('listPaymentMethods', () => {
      it('should list customer payment methods', async () => {
        mockStripeClient.paymentMethods.list.mockResolvedValueOnce({
          data: [mockPaymentMethod],
          has_more: false,
        });

        const result = await stripeService.listPaymentMethods('cus_mock123');

        expect(result.data).toHaveLength(1);
        expect(result.data[0].card?.last4).toBe('4242');
      });

      it('should filter by type', async () => {
        mockStripeClient.paymentMethods.list.mockResolvedValueOnce({
          data: [],
          has_more: false,
        });

        await stripeService.listPaymentMethods('cus_mock123', 'us_bank_account');

        expect(mockStripeClient.paymentMethods.list).toHaveBeenCalledWith({
          customer: 'cus_mock123',
          type: 'us_bank_account',
        });
      });
    });
  });

  // =========================================================================
  // Refund Tests
  // =========================================================================

  describe('Refund Management', () => {
    describe('createRefund', () => {
      it('should create a full refund', async () => {
        mockStripeClient.refunds.create.mockResolvedValueOnce(mockRefund);

        const result = await stripeService.createRefund({
          paymentIntentId: 'pi_mock123',
        });

        expect(result.status).toBe('succeeded');
        expect(mockStripeClient.refunds.create).toHaveBeenCalledWith({
          payment_intent: 'pi_mock123',
          amount: undefined,
          reason: undefined,
        });
      });

      it('should create a partial refund', async () => {
        mockStripeClient.refunds.create.mockResolvedValueOnce({
          ...mockRefund,
          amount: 3000,
        });

        const result = await stripeService.createRefund({
          paymentIntentId: 'pi_mock123',
          amount: 3000,
        });

        expect(result.amount).toBe(3000);
      });

      it('should include refund reason', async () => {
        mockStripeClient.refunds.create.mockResolvedValueOnce(mockRefund);

        await stripeService.createRefund({
          paymentIntentId: 'pi_mock123',
          reason: 'requested_by_customer',
        });

        expect(mockStripeClient.refunds.create).toHaveBeenCalledWith(
          expect.objectContaining({ reason: 'requested_by_customer' })
        );
      });
    });
  });

  // =========================================================================
  // Payout Tests
  // =========================================================================

  describe('Payout Management', () => {
    describe('createPayout', () => {
      it('should create a payout', async () => {
        mockStripeClient.payouts.create.mockResolvedValueOnce({
          id: 'po_mock123',
          amount: 50000,
          currency: 'usd',
          status: 'pending',
        });

        const result = await stripeService.createPayout({
          amount: 50000,
        });

        expect(result.id).toBe('po_mock123');
        expect(result.amount).toBe(50000);
      });

      it('should reject zero amount', async () => {
        await expect(
          stripeService.createPayout({ amount: 0 })
        ).rejects.toThrow('Amount must be positive');
      });
    });

    describe('cancelPayout', () => {
      it('should cancel a payout', async () => {
        mockStripeClient.payouts.cancel.mockResolvedValueOnce({
          id: 'po_mock123',
          status: 'canceled',
        });

        const result = await stripeService.cancelPayout('po_mock123');

        expect(result.status).toBe('canceled');
      });
    });
  });

  // =========================================================================
  // Webhook Tests
  // =========================================================================

  describe('Webhook Handling', () => {
    describe('constructWebhookEvent', () => {
      it('should construct a webhook event', () => {
        const mockEvent = {
          id: 'evt_mock123',
          type: 'payment_intent.succeeded',
          data: { object: mockPaymentIntent },
        };

        mockStripeClient.webhooks.constructEvent.mockReturnValueOnce(mockEvent);

        const result = stripeService.constructWebhookEvent(
          'payload',
          'signature',
          'secret'
        );

        expect(result.type).toBe('payment_intent.succeeded');
        expect(mockStripeClient.webhooks.constructEvent).toHaveBeenCalledWith(
          'payload',
          'signature',
          'secret'
        );
      });

      it('should throw on invalid signature', () => {
        mockStripeClient.webhooks.constructEvent.mockImplementationOnce(() => {
          throw new Error('Invalid signature');
        });

        expect(() =>
          stripeService.constructWebhookEvent('payload', 'invalid', 'secret')
        ).toThrow('Invalid signature');
      });
    });
  });

  // =========================================================================
  // Fee Calculation Tests
  // =========================================================================

  describe('Fee Calculations', () => {
    describe('calculateFee', () => {
      it('should calculate standard Stripe fee', () => {
        // $100.00 -> 2.9% + $0.30 = $3.20
        const fee = stripeService.calculateFee(10000);
        expect(fee).toBe(320);
      });

      it('should calculate fee for small amount', () => {
        // $1.00 -> 2.9% + $0.30 = $0.33
        const fee = stripeService.calculateFee(100);
        expect(fee).toBe(33);
      });

      it('should calculate fee for large amount', () => {
        // $1000.00 -> 2.9% + $0.30 = $29.30
        const fee = stripeService.calculateFee(100000);
        expect(fee).toBe(2930);
      });

      it('should accept custom fee rate', () => {
        // $100.00 with 1.5% rate + $0.30 = $1.80
        const fee = stripeService.calculateFee(10000, 0.015, 30);
        expect(fee).toBe(180);
      });
    });

    describe('calculateNetAmount', () => {
      it('should calculate net amount after fees', () => {
        // $100.00 - $3.20 fee = $96.80
        const net = stripeService.calculateNetAmount(10000);
        expect(net).toBe(9680);
      });

      it('should calculate net for large amount', () => {
        // $1000.00 - $29.30 fee = $970.70
        const net = stripeService.calculateNetAmount(100000);
        expect(net).toBe(97070);
      });
    });
  });
});

// ===========================================================================
// Amount Conversion Tests
// ===========================================================================

describe('Amount Conversions', () => {
  describe('Dollars to Cents', () => {
    it('should convert whole dollars', () => {
      const toCents = (dollars: number): number => Math.round(dollars * 100);

      expect(toCents(1)).toBe(100);
      expect(toCents(100)).toBe(10000);
      expect(toCents(1000)).toBe(100000);
    });

    it('should convert decimal amounts', () => {
      const toCents = (dollars: number): number => Math.round(dollars * 100);

      expect(toCents(1.50)).toBe(150);
      expect(toCents(99.99)).toBe(9999);
      expect(toCents(0.50)).toBe(50);
    });

    it('should handle floating point precision', () => {
      const toCents = (dollars: number): number => Math.round(dollars * 100);

      // 0.1 + 0.2 should be 30 cents, not 30.000000000000004
      expect(toCents(0.1 + 0.2)).toBe(30);
    });
  });

  describe('Cents to Dollars', () => {
    it('should convert whole cents', () => {
      const toDollars = (cents: number): number => cents / 100;

      expect(toDollars(100)).toBe(1);
      expect(toDollars(10000)).toBe(100);
      expect(toDollars(50)).toBe(0.5);
    });

    it('should format for display', () => {
      const formatDollars = (cents: number): string => {
        return (cents / 100).toFixed(2);
      };

      expect(formatDollars(100)).toBe('1.00');
      expect(formatDollars(9999)).toBe('99.99');
      expect(formatDollars(50)).toBe('0.50');
    });
  });
});
