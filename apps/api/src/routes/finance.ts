import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../index";
import { financeService } from "@pull/core/services/finance";

const app = new Hono<Env>();

const withdrawalSchema = z.object({
  amount: z.number().positive(),
  destination: z.object({
    type: z.enum(["bank", "paypal", "venmo", "crypto"]),
    accountId: z.string(),
    accountName: z.string().optional(),
  }),
});

const connectWalletSchema = z.object({
  walletAddress: z.string(),
  blockchain: z.enum(["bitcoin", "ethereum", "solana", "polygon"]),
});

const autoInvestSchema = z.object({
  enabled: z.boolean(),
  percentage: z.number().min(0).max(100),
  minThreshold: z.number().positive(),
  destination: z.enum(["savings", "crypto", "external"]),
  externalAccount: z.string().optional(),
});

/**
 * POST /api/v1/finance/virtual-card/create
 * Create virtual PULL card
 */
app.post("/virtual-card/create", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const card = await financeService.createVirtualCard(userId);

  return c.json({
    success: true,
    data: card,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/finance/withdraw/instant
 * Process instant withdrawal
 */
app.post("/withdraw/instant", zValidator("json", withdrawalSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const { amount, destination } = c.req.valid("json");
  const withdrawal = await financeService.processInstantWithdrawal(userId, amount, destination);

  return c.json({
    success: true,
    data: withdrawal,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/finance/crypto/connect-wallet
 * Connect crypto wallet
 */
app.post("/crypto/connect-wallet", zValidator("json", connectWalletSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const { walletAddress, blockchain } = c.req.valid("json");
  const wallet = await financeService.connectCryptoWallet(userId, walletAddress, blockchain);

  return c.json({
    success: true,
    data: wallet,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/finance/tax-documents/:year
 * Get tax documents for year
 */
app.get("/tax-documents/:year", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const year = parseInt(c.req.param("year"), 10);
  if (isNaN(year) || year < 2000 || year > 2100) {
    return c.json({ success: false, error: { code: "BAD_REQUEST", message: "Invalid year" } }, 400);
  }

  const document = await financeService.generateTaxDocument(userId, year);

  return c.json({
    success: true,
    data: document,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/finance/auto-invest/configure
 * Configure auto-invest settings
 */
app.post("/auto-invest/configure", zValidator("json", autoInvestSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const config = c.req.valid("json");
  const result = await financeService.configureAutoInvest(userId, config);

  return c.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
});

export default app;
