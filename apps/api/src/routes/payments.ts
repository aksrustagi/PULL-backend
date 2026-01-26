/**
 * Payments API Routes
 * Handles deposits, withdrawals, and payment methods using Stripe
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { getConvexClient } from "../lib/convex";
import { api } from "@pull/db/convex/_generated/api";
import {
  getCheckoutService,
  getPayoutService,
  getStripeClient,
} from "@pull/core/services/stripe";
import type { CreateCheckoutSessionParams } from "@pull/core/services/stripe";
import { logger } from "@pull/core/services/logger";

const app = new Hono<Env>();

// ============================================================================
// Validation Schemas
// ============================================================================

const createDepositSchema = z.object({
  amount: z.number().int().min(100).max(100000000), // Min $1, Max $1M in cents
  currency: z.string().length(3).default("usd"),
  paymentMethods: z.array(z.enum(["card", "bank_transfer", "us_bank_account"])).optional(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  idempotencyKey: z.string().uuid().optional(),
});

const createWithdrawalSchema = z.object({
  amount: z.number().int().min(100).max(100000000), // Min $1, Max $1M in cents
  method: z.enum(["standard", "instant"]).default("standard"),
  idempotencyKey: z.string().uuid().optional(),
});

const setupConnectedAccountSchema = z.object({
  refreshUrl: z.string().url(),
  returnUrl: z.string().url(),
});

const addPaymentMethodSchema = z.object({
  paymentMethodId: z.string().min(1),
});

const createSetupIntentSchema = z.object({
  paymentMethodTypes: z.array(z.enum(["card", "us_bank_account"])).optional(),
});

// ============================================================================
// Deposit Routes
// ============================================================================

/**
 * POST /payments/deposit
 * Create a checkout session for depositing funds
 */
app.post("/deposit", zValidator("json", createDepositSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();
    const checkoutService = getCheckoutService();
    const stripeClient = getStripeClient();

    // Get user for email
    const user = await convex.query(api.users.getById, { id: userId as any });
    if (!user) {
      return c.json(
        {
          success: false,
          error: { code: "USER_NOT_FOUND", message: "User not found" },
          requestId,
        },
        404
      );
    }

    // Get or create Stripe customer
    let customerId: string | undefined;
    if (user.email) {
      const customer = await stripeClient.getOrCreateCustomer(user.email, {
        name: user.displayName ?? undefined,
        metadata: { userId, pullUserId: userId },
      });
      customerId = customer.id;
    }

    // Create checkout session
    const session = await checkoutService.createDepositSession({
      userId,
      amount: body.amount,
      currency: body.currency,
      paymentMethods: body.paymentMethods as CreateCheckoutSessionParams["paymentMethods"],
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
      customerId,
      customerEmail: user.email,
      idempotencyKey: body.idempotencyKey,
    });

    // Calculate fee info
    const feeInfo = checkoutService.calculateDepositFee(body.amount);

    // Record pending deposit in database
    await convex.mutation(api.balances.recordDeposit, {
      method: "card",
      amount: body.amount,
      currency: body.currency.toUpperCase(),
      fee: feeInfo.feeAmount,
      externalId: session.id,
    });

    return c.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
        expiresAt: session.expiresAt,
        amount: body.amount,
        fee: feeInfo.feeAmount,
        netAmount: feeInfo.netAmount,
        currency: body.currency,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to create deposit session", { userId, requestId, error });
    return c.json(
      {
        success: false,
        error: {
          code: "DEPOSIT_FAILED",
          message: error instanceof Error ? error.message : "Failed to create deposit session",
        },
        requestId,
      },
      500
    );
  }
});

/**
 * GET /payments/deposit/:sessionId
 * Get checkout session status
 */
app.get("/deposit/:sessionId", async (c) => {
  const userId = c.get("userId");
  const sessionId = c.req.param("sessionId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const checkoutService = getCheckoutService();
    const session = await checkoutService.getSession(sessionId);

    if (!session) {
      return c.json(
        {
          success: false,
          error: { code: "SESSION_NOT_FOUND", message: "Checkout session not found" },
          requestId,
        },
        404
      );
    }

    // Verify session belongs to user
    if (session.metadata.userId !== userId) {
      return c.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "Access denied" },
          requestId,
        },
        403
      );
    }

    return c.json({
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
        paymentStatus: session.paymentStatus,
        amount: session.amount,
        currency: session.currency,
        expiresAt: session.expiresAt,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to get session", { userId, sessionId, requestId, error });
    return c.json(
      {
        success: false,
        error: {
          code: "SESSION_FETCH_FAILED",
          message: "Failed to retrieve session status",
        },
        requestId,
      },
      500
    );
  }
});

/**
 * GET /payments/deposit/fees
 * Get deposit fee structure
 */
app.get("/fees/deposit", async (c) => {
  const requestId = c.get("requestId");
  const checkoutService = getCheckoutService();
  const feeStructure = checkoutService.getFeeStructure();

  return c.json({
    success: true,
    data: {
      depositFeePercent: feeStructure.depositFeePercent,
      depositFeeMin: feeStructure.depositFeeMin,
      depositFeeMax: feeStructure.depositFeeMax,
      description: "2.9% + $0.30 per transaction",
    },
    requestId,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Withdrawal Routes
// ============================================================================

/**
 * POST /payments/withdraw
 * Request a withdrawal
 */
app.post("/withdraw", zValidator("json", createWithdrawalSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();
    const payoutService = getPayoutService();
    const checkoutService = getCheckoutService();

    // Get user
    const user = await convex.query(api.users.getById, { id: userId as any });
    if (!user) {
      return c.json(
        {
          success: false,
          error: { code: "USER_NOT_FOUND", message: "User not found" },
          requestId,
        },
        404
      );
    }

    // Check KYC status for withdrawals
    if (user.kycStatus !== "approved") {
      return c.json(
        {
          success: false,
          error: {
            code: "KYC_REQUIRED",
            message: "KYC verification required for withdrawals",
          },
          requestId,
        },
        403
      );
    }

    // Get user's connected account
    const connectedAccountId = (user as any).stripeConnectedAccountId;
    if (!connectedAccountId) {
      return c.json(
        {
          success: false,
          error: {
            code: "NO_PAYOUT_ACCOUNT",
            message: "Please set up a payout account first",
          },
          requestId,
        },
        400
      );
    }

    // Verify account is ready for payouts
    const isReady = await payoutService.isAccountReadyForPayouts(connectedAccountId);
    if (!isReady) {
      return c.json(
        {
          success: false,
          error: {
            code: "ACCOUNT_NOT_READY",
            message: "Your payout account setup is incomplete",
          },
          requestId,
        },
        400
      );
    }

    // Check user balance
    const buyingPower = await convex.query(api.balances.getBuyingPower, {});
    const availableBalance = buyingPower?.available ?? 0;

    if (availableBalance < body.amount) {
      return c.json(
        {
          success: false,
          error: {
            code: "INSUFFICIENT_BALANCE",
            message: `Insufficient balance. Available: $${(availableBalance / 100).toFixed(2)}`,
          },
          requestId,
        },
        400
      );
    }

    // Calculate fees
    const isInstant = body.method === "instant";
    const feeInfo = checkoutService.calculateWithdrawalFee(body.amount, isInstant);

    // Record withdrawal request in database (places hold)
    await convex.mutation(api.balances.recordWithdrawal, {
      method: "bank_transfer",
      amount: body.amount,
      currency: "USD",
      fee: feeInfo.feeAmount,
      destination: connectedAccountId,
    });

    // Process withdrawal via Stripe
    const result = await payoutService.processWithdrawal({
      userId,
      connectedAccountId,
      amount: body.amount,
      method: body.method,
      idempotencyKey: body.idempotencyKey,
    });

    // Get estimated arrival
    const arrival = await payoutService.getEstimatedArrival(body.method);

    return c.json({
      success: true,
      data: {
        transferId: result.transferId,
        amount: body.amount,
        fee: result.fee,
        netAmount: result.netAmount,
        currency: result.currency,
        status: result.status,
        estimatedArrival: arrival.description,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to process withdrawal", { userId, amount: body.amount, requestId, error });
    return c.json(
      {
        success: false,
        error: {
          code: "WITHDRAWAL_FAILED",
          message: error instanceof Error ? error.message : "Failed to process withdrawal",
        },
        requestId,
      },
      500
    );
  }
});

/**
 * GET /payments/fees/withdraw
 * Get withdrawal fee structure
 */
app.get("/fees/withdraw", async (c) => {
  const requestId = c.get("requestId");
  const checkoutService = getCheckoutService();
  const feeStructure = checkoutService.getFeeStructure();

  return c.json({
    success: true,
    data: {
      standard: {
        feePercent: feeStructure.withdrawalFeePercent,
        feeMin: feeStructure.withdrawalFeeMin,
        feeMax: feeStructure.withdrawalFeeMax,
        estimatedArrival: "1-2 business days",
      },
      instant: {
        feePercent: feeStructure.instantPayoutFeePercent,
        feeMin: feeStructure.instantPayoutFeeMin,
        estimatedArrival: "Within 30 minutes",
      },
    },
    requestId,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Connected Account (Payout Account) Routes
// ============================================================================

/**
 * POST /payments/payout-account/setup
 * Create or get onboarding link for connected account
 */
app.post(
  "/payout-account/setup",
  zValidator("json", setupConnectedAccountSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const requestId = c.get("requestId");

    if (!userId) {
      return c.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "User not authenticated" },
          requestId,
        },
        401
      );
    }

    try {
      const convex = getConvexClient();
      const payoutService = getPayoutService();

      // Get user
      const user = await convex.query(api.users.getById, { id: userId as any });
      if (!user) {
        return c.json(
          {
            success: false,
            error: { code: "USER_NOT_FOUND", message: "User not found" },
            requestId,
          },
          404
        );
      }

      let accountId = (user as any).stripeConnectedAccountId;

      // Create connected account if doesn't exist
      if (!accountId) {
        const account = await payoutService.createConnectedAccount({
          email: user.email,
          metadata: { userId, pullUserId: userId },
        });
        accountId = account.id;

        // Store connected account ID on user
        await convex.mutation(api.payments.setStripeConnectedAccount, {
          connectedAccountId: accountId,
        });
      }

      // Create onboarding link
      const link = await payoutService.createAccountLink({
        accountId,
        refreshUrl: body.refreshUrl,
        returnUrl: body.returnUrl,
        type: "account_onboarding",
      });

      return c.json({
        success: true,
        data: {
          accountId,
          onboardingUrl: link.url,
          expiresAt: link.expiresAt,
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to setup payout account", { userId, requestId, error });
      return c.json(
        {
          success: false,
          error: {
            code: "SETUP_FAILED",
            message: error instanceof Error ? error.message : "Failed to setup payout account",
          },
          requestId,
        },
        500
      );
    }
  }
);

/**
 * GET /payments/payout-account
 * Get connected account status
 */
app.get("/payout-account", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();
    const payoutService = getPayoutService();

    // Get user
    const user = await convex.query(api.users.getById, { id: userId as any });
    if (!user) {
      return c.json(
        {
          success: false,
          error: { code: "USER_NOT_FOUND", message: "User not found" },
          requestId,
        },
        404
      );
    }

    const accountId = (user as any).stripeConnectedAccountId;
    if (!accountId) {
      return c.json({
        success: true,
        data: {
          hasAccount: false,
          isReady: false,
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }

    const account = await payoutService.getConnectedAccount(accountId);
    if (!account) {
      return c.json({
        success: true,
        data: {
          hasAccount: false,
          isReady: false,
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }

    return c.json({
      success: true,
      data: {
        hasAccount: true,
        accountId: account.id,
        isReady: account.payoutsEnabled && account.detailsSubmitted,
        chargesEnabled: account.chargesEnabled,
        payoutsEnabled: account.payoutsEnabled,
        detailsSubmitted: account.detailsSubmitted,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to get payout account", { userId, requestId, error });
    return c.json(
      {
        success: false,
        error: {
          code: "FETCH_FAILED",
          message: "Failed to retrieve payout account status",
        },
        requestId,
      },
      500
    );
  }
});

/**
 * GET /payments/payout-account/dashboard
 * Get login link for Stripe Express dashboard
 */
app.get("/payout-account/dashboard", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();
    const payoutService = getPayoutService();

    // Get user
    const user = await convex.query(api.users.getById, { id: userId as any });
    if (!user) {
      return c.json(
        {
          success: false,
          error: { code: "USER_NOT_FOUND", message: "User not found" },
          requestId,
        },
        404
      );
    }

    const accountId = (user as any).stripeConnectedAccountId;
    if (!accountId) {
      return c.json(
        {
          success: false,
          error: {
            code: "NO_ACCOUNT",
            message: "No payout account found. Please set one up first.",
          },
          requestId,
        },
        400
      );
    }

    const link = await payoutService.createLoginLink(accountId);

    return c.json({
      success: true,
      data: {
        dashboardUrl: link.url,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to create dashboard link", { userId, requestId, error });
    return c.json(
      {
        success: false,
        error: {
          code: "LINK_FAILED",
          message: "Failed to create dashboard link",
        },
        requestId,
      },
      500
    );
  }
});

// ============================================================================
// Payment Methods Routes
// ============================================================================

/**
 * POST /payments/methods
 * Attach a payment method to the customer
 */
app.post("/methods", zValidator("json", addPaymentMethodSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();
    const stripeClient = getStripeClient();

    // Get user
    const user = await convex.query(api.users.getById, { id: userId as any });
    if (!user) {
      return c.json(
        {
          success: false,
          error: { code: "USER_NOT_FOUND", message: "User not found" },
          requestId,
        },
        404
      );
    }

    // Get or create customer
    const customer = await stripeClient.getOrCreateCustomer(user.email, {
      name: user.displayName ?? undefined,
      metadata: { userId, pullUserId: userId },
    });

    // Attach payment method
    const paymentMethod = await stripeClient.attachPaymentMethod({
      paymentMethodId: body.paymentMethodId,
      customerId: customer.id,
    });

    return c.json({
      success: true,
      data: {
        id: paymentMethod.id,
        type: paymentMethod.type,
        card: paymentMethod.card
          ? {
              brand: paymentMethod.card.brand,
              last4: paymentMethod.card.last4,
              expMonth: paymentMethod.card.expMonth,
              expYear: paymentMethod.card.expYear,
            }
          : undefined,
        usBankAccount: paymentMethod.usBankAccount
          ? {
              bankName: paymentMethod.usBankAccount.bankName,
              last4: paymentMethod.usBankAccount.last4,
              accountType: paymentMethod.usBankAccount.accountType,
            }
          : undefined,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to attach payment method", { userId, paymentMethodId: body.paymentMethodId, requestId, error });
    return c.json(
      {
        success: false,
        error: {
          code: "ATTACH_FAILED",
          message: error instanceof Error ? error.message : "Failed to attach payment method",
        },
        requestId,
      },
      500
    );
  }
});

/**
 * GET /payments/methods
 * List customer's payment methods
 */
app.get("/methods", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();
    const stripeClient = getStripeClient();

    // Get user
    const user = await convex.query(api.users.getById, { id: userId as any });
    if (!user) {
      return c.json(
        {
          success: false,
          error: { code: "USER_NOT_FOUND", message: "User not found" },
          requestId,
        },
        404
      );
    }

    // Find customer
    const customer = await stripeClient.findCustomerByEmail(user.email);
    if (!customer) {
      return c.json({
        success: true,
        data: {
          methods: [],
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }

    // Get payment methods
    const cardMethods = await stripeClient.listPaymentMethods(customer.id, "card");
    const bankMethods = await stripeClient.listPaymentMethods(
      customer.id,
      "us_bank_account"
    );

    const methods = [...cardMethods, ...bankMethods].map((pm) => ({
      id: pm.id,
      type: pm.type,
      card: pm.card
        ? {
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.expMonth,
            expYear: pm.card.expYear,
          }
        : undefined,
      usBankAccount: pm.usBankAccount
        ? {
            bankName: pm.usBankAccount.bankName,
            last4: pm.usBankAccount.last4,
            accountType: pm.usBankAccount.accountType,
          }
        : undefined,
    }));

    return c.json({
      success: true,
      data: {
        methods,
        defaultMethodId: customer.defaultPaymentMethodId,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to list payment methods", { userId, requestId, error });
    return c.json(
      {
        success: false,
        error: {
          code: "LIST_FAILED",
          message: "Failed to retrieve payment methods",
        },
        requestId,
      },
      500
    );
  }
});

/**
 * DELETE /payments/methods/:methodId
 * Remove a payment method
 */
app.delete("/methods/:methodId", async (c) => {
  const userId = c.get("userId");
  const methodId = c.req.param("methodId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();
    const stripeClient = getStripeClient();

    // Verify the payment method belongs to the user
    const paymentMethod = await stripeClient.getPaymentMethod(methodId);
    if (!paymentMethod) {
      return c.json(
        {
          success: false,
          error: { code: "METHOD_NOT_FOUND", message: "Payment method not found" },
          requestId,
        },
        404
      );
    }

    // Get user and verify ownership
    const user = await convex.query(api.users.getById, { id: userId as any });
    if (!user) {
      return c.json(
        {
          success: false,
          error: { code: "USER_NOT_FOUND", message: "User not found" },
          requestId,
        },
        404
      );
    }

    const customer = await stripeClient.findCustomerByEmail(user.email);
    if (!customer || paymentMethod.customerId !== customer.id) {
      return c.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "Access denied" },
          requestId,
        },
        403
      );
    }

    // Detach the payment method
    await stripeClient.detachPaymentMethod(methodId);

    return c.json({
      success: true,
      data: { detached: true },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to detach payment method", { userId, methodId, requestId, error });
    return c.json(
      {
        success: false,
        error: {
          code: "DETACH_FAILED",
          message: "Failed to remove payment method",
        },
        requestId,
      },
      500
    );
  }
});

/**
 * POST /payments/methods/setup-intent
 * Create a SetupIntent for collecting payment methods on the client
 */
app.post(
  "/methods/setup-intent",
  zValidator("json", createSetupIntentSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const requestId = c.get("requestId");

    if (!userId) {
      return c.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "User not authenticated" },
          requestId,
        },
        401
      );
    }

    try {
      const convex = getConvexClient();
      const stripeClient = getStripeClient();

      // Get user
      const user = await convex.query(api.users.getById, { id: userId as any });
      if (!user) {
        return c.json(
          {
            success: false,
            error: { code: "USER_NOT_FOUND", message: "User not found" },
            requestId,
          },
          404
        );
      }

      // Get or create customer
      const customer = await stripeClient.getOrCreateCustomer(user.email, {
        name: user.displayName ?? undefined,
        metadata: { userId, pullUserId: userId },
      });

      // Create SetupIntent
      const setupIntent = await stripeClient.createSetupIntent({
        customerId: customer.id,
        paymentMethodTypes: body.paymentMethodTypes,
        usage: "off_session",
        metadata: { userId, pullUserId: userId },
      });

      return c.json({
        success: true,
        data: {
          setupIntentId: setupIntent.id,
          clientSecret: setupIntent.clientSecret,
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to create setup intent", { userId, requestId, error });
      return c.json(
        {
          success: false,
          error: {
            code: "SETUP_INTENT_FAILED",
            message: "Failed to create setup intent",
          },
          requestId,
        },
        500
      );
    }
  }
);

// ============================================================================
// History Routes
// ============================================================================

/**
 * GET /payments/history
 * Get payment history (deposits and withdrawals)
 */
app.get("/history", async (c) => {
  const userId = c.get("userId");
  const type = c.req.query("type"); // "deposit" | "withdrawal" | undefined (both)
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 100);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();

    // Fetch deposits and withdrawals from Convex
    const [deposits, withdrawals] = await Promise.all([
      type === "withdrawal"
        ? Promise.resolve([])
        : convex.query(api.payments.getDeposits, {
            limit: type === "deposit" ? limit : Math.ceil(limit / 2),
          }),
      type === "deposit"
        ? Promise.resolve([])
        : convex.query(api.payments.getWithdrawals, {
            limit: type === "withdrawal" ? limit : Math.ceil(limit / 2),
          }),
    ]);

    // Combine and sort by date
    const history = [
      ...(deposits || []).map((d: any) => ({
        id: d._id,
        type: "deposit" as const,
        amount: d.amount,
        fee: d.fee,
        netAmount: d.netAmount,
        status: d.status,
        method: d.method,
        createdAt: d.createdAt,
        completedAt: d.completedAt,
      })),
      ...(withdrawals || []).map((w: any) => ({
        id: w._id,
        type: "withdrawal" as const,
        amount: w.amount,
        fee: w.fee,
        netAmount: w.netAmount,
        status: w.status,
        method: w.method,
        destination: w.destination,
        createdAt: w.createdAt,
        completedAt: w.completedAt,
      })),
    ]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(offset, offset + limit);

    return c.json({
      success: true,
      data: {
        transactions: history,
        pagination: {
          limit,
          offset,
          total: history.length,
        },
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to get payment history", { userId, requestId, error });
    return c.json(
      {
        success: false,
        error: {
          code: "HISTORY_FAILED",
          message: "Failed to retrieve payment history",
        },
        requestId,
      },
      500
    );
  }
});

/**
 * GET /payments/balance
 * Get user's current balance
 */
app.get("/balance", async (c) => {
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  if (!userId) {
    return c.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
        requestId,
      },
      401
    );
  }

  try {
    const convex = getConvexClient();
    const buyingPower = await convex.query(api.balances.getBuyingPower, {});

    return c.json({
      success: true,
      data: {
        available: buyingPower?.available ?? 0,
        held: buyingPower?.held ?? 0,
        pending: buyingPower?.pending ?? 0,
        total: buyingPower?.total ?? 0,
        currency: "usd",
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to get balance", { userId, requestId, error });
    return c.json(
      {
        success: false,
        error: {
          code: "BALANCE_FAILED",
          message: "Failed to retrieve balance",
        },
        requestId,
      },
      500
    );
  }
});

export { app as paymentsRoutes };
