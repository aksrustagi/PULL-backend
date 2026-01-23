/**
 * Fantasy Payment/Wallet API Routes
 * Handles deposits, withdrawals, FAAB management, and transaction history
 */

import { Hono } from "hono";

const payments = new Hono();

// ============================================================================
// Wallet Overview
// ============================================================================

payments.get("/wallet", async (c) => {
  const userId = c.get("userId");

  return c.json({
    data: {
      userId,
      balances: {
        available: 500.00,
        pending: 25.00,
        inMarkets: 150.00,
        totalValue: 675.00,
      },
      currency: "USD",
      faabBudgets: [
        { leagueId: "league_1", leagueName: "Main League", remaining: 85, total: 100 },
        { leagueId: "league_2", leagueName: "Work League", remaining: 100, total: 100 },
      ],
    },
  });
});

// ============================================================================
// Deposit
// ============================================================================

payments.post("/deposit", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const { amount, method, paymentMethodId } = body;

  if (!amount || amount <= 0) {
    return c.json({ error: "Invalid amount" }, 400);
  }

  if (amount > 10000) {
    return c.json({ error: "Maximum deposit is $10,000" }, 400);
  }

  const validMethods = ["card", "bank_transfer", "crypto", "apple_pay", "google_pay"];
  if (!validMethods.includes(method)) {
    return c.json({ error: "Invalid payment method" }, 400);
  }

  // In production, integrate with Stripe/payment processor
  const transaction = {
    id: `txn_${Date.now()}`,
    userId,
    type: "deposit",
    amount,
    method,
    status: "pending",
    createdAt: Date.now(),
    estimatedCompletion: method === "bank_transfer" ? "2-3 business days" : "Instant",
  };

  return c.json({ data: transaction }, 201);
});

// ============================================================================
// Withdrawal
// ============================================================================

payments.post("/withdraw", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const { amount, method, destination } = body;

  if (!amount || amount <= 0) {
    return c.json({ error: "Invalid amount" }, 400);
  }

  // Check available balance
  const availableBalance = 500.00; // Would come from DB
  if (amount > availableBalance) {
    return c.json({ error: "Insufficient balance" }, 400);
  }

  if (amount < 10) {
    return c.json({ error: "Minimum withdrawal is $10" }, 400);
  }

  const validMethods = ["bank_transfer", "crypto", "paypal"];
  if (!validMethods.includes(method)) {
    return c.json({ error: "Invalid withdrawal method" }, 400);
  }

  const transaction = {
    id: `txn_${Date.now()}`,
    userId,
    type: "withdrawal",
    amount,
    method,
    destination,
    status: "processing",
    createdAt: Date.now(),
    estimatedCompletion: method === "crypto" ? "10-30 minutes" : "3-5 business days",
    fee: method === "crypto" ? 1.00 : 0,
  };

  return c.json({ data: transaction }, 201);
});

// ============================================================================
// Transaction History
// ============================================================================

payments.get("/transactions", async (c) => {
  const userId = c.get("userId");
  const { type, limit, offset, startDate, endDate } = c.req.query();

  const transactions = [
    {
      id: "txn_1",
      type: "deposit",
      amount: 100.00,
      method: "card",
      status: "completed",
      createdAt: Date.now() - 86400000 * 7,
      completedAt: Date.now() - 86400000 * 7,
    },
    {
      id: "txn_2",
      type: "bet",
      amount: -25.00,
      description: "Bet: Team A vs Team B - Week 5",
      marketId: "market_1",
      status: "completed",
      createdAt: Date.now() - 86400000 * 5,
    },
    {
      id: "txn_3",
      type: "payout",
      amount: 45.00,
      description: "Market settled: Team A wins",
      marketId: "market_1",
      status: "completed",
      createdAt: Date.now() - 86400000 * 3,
    },
    {
      id: "txn_4",
      type: "faab",
      amount: -15.00,
      description: "FAAB bid: Player X ($15)",
      leagueId: "league_1",
      status: "completed",
      createdAt: Date.now() - 86400000 * 2,
    },
  ];

  const filtered = type
    ? transactions.filter((t) => t.type === type)
    : transactions;

  return c.json({
    data: filtered.slice(
      parseInt(offset || "0"),
      parseInt(offset || "0") + parseInt(limit || "50")
    ),
    pagination: {
      total: filtered.length,
      offset: parseInt(offset || "0"),
      limit: parseInt(limit || "50"),
    },
  });
});

// ============================================================================
// Payment Methods
// ============================================================================

payments.get("/methods", async (c) => {
  const userId = c.get("userId");

  return c.json({
    data: [
      {
        id: "pm_1",
        type: "card",
        brand: "visa",
        last4: "4242",
        expiryMonth: 12,
        expiryYear: 2027,
        isDefault: true,
      },
      {
        id: "pm_2",
        type: "bank_account",
        bankName: "Chase",
        last4: "6789",
        accountType: "checking",
        isDefault: false,
      },
    ],
  });
});

payments.post("/methods", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const { type, token } = body;

  // In production, verify with Stripe
  return c.json({
    data: {
      id: `pm_${Date.now()}`,
      type,
      status: "verified",
      createdAt: Date.now(),
    },
  }, 201);
});

payments.delete("/methods/:methodId", async (c) => {
  const { methodId } = c.req.param();

  return c.json({ success: true });
});

// ============================================================================
// FAAB Management
// ============================================================================

payments.get("/faab/:leagueId", async (c) => {
  const userId = c.get("userId");
  const { leagueId } = c.req.param();

  return c.json({
    data: {
      leagueId,
      userId,
      totalBudget: 100,
      spent: 15,
      remaining: 85,
      pendingBids: 25,
      effectiveRemaining: 60,
      history: [
        {
          week: 3,
          playerName: "Player X",
          bidAmount: 10,
          result: "won",
          nextHighestBid: 7,
        },
        {
          week: 4,
          playerName: "Player Y",
          bidAmount: 5,
          result: "won",
          nextHighestBid: 3,
        },
        {
          week: 5,
          playerName: "Player Z",
          bidAmount: 12,
          result: "lost",
          winningBid: 15,
        },
      ],
    },
  });
});

payments.get("/faab/:leagueId/leaderboard", async (c) => {
  const { leagueId } = c.req.param();

  return c.json({
    data: [
      { teamId: "t1", teamName: "Team Alpha", remaining: 95, spent: 5 },
      { teamId: "t2", teamName: "Team Beta", remaining: 85, spent: 15 },
      { teamId: "t3", teamName: "Team Gamma", remaining: 72, spent: 28 },
    ],
  });
});

// ============================================================================
// Betting P&L
// ============================================================================

payments.get("/pnl", async (c) => {
  const userId = c.get("userId");
  const { period } = c.req.query();

  return c.json({
    data: {
      period: period || "all_time",
      totalBets: 45,
      totalWagered: 675.00,
      totalReturns: 812.50,
      netPnL: 137.50,
      roi: 0.204,
      winRate: 0.62,
      averageBet: 15.00,
      bestBet: { amount: 50, payout: 125, market: "Week 8 Total Points" },
      worstBet: { amount: 25, payout: 0, market: "Season MVP" },
      byMarketType: {
        matchup: { bets: 20, pnl: 85.00, roi: 0.28 },
        player_prop: { bets: 15, pnl: 32.50, roi: 0.14 },
        league_winner: { bets: 5, pnl: 20.00, roi: 0.16 },
        weekly_high: { bets: 5, pnl: 0, roi: 0 },
      },
      weeklyPnL: [
        { week: 1, pnl: 15.00 },
        { week: 2, pnl: -10.00 },
        { week: 3, pnl: 25.00 },
        { week: 4, pnl: 30.00 },
        { week: 5, pnl: -8.00 },
      ],
    },
  });
});

// ============================================================================
// Promo/Bonus
// ============================================================================

payments.get("/promotions", async (c) => {
  const userId = c.get("userId");

  return c.json({
    data: [
      {
        id: "promo_1",
        title: "Welcome Bonus",
        description: "Get 100% match on your first deposit up to $50",
        type: "deposit_match",
        value: 50,
        requirements: { minDeposit: 20, rollover: 3 },
        expiresAt: Date.now() + 86400000 * 30,
        status: "available",
      },
      {
        id: "promo_2",
        title: "Refer a Friend",
        description: "Both get $10 when your friend joins a league",
        type: "referral",
        value: 10,
        status: "available",
      },
    ],
  });
});

payments.post("/promotions/:promoId/claim", async (c) => {
  const { promoId } = c.req.param();

  return c.json({
    data: {
      promoId,
      status: "claimed",
      creditedAmount: 50,
      requirements: "Wager 3x before withdrawal",
    },
  });
});

export default payments;
