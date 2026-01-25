/**
 * Market Maker Mode Types
 *
 * Types for the market maker system that allows users to provide
 * liquidity to markets and earn spread as passive income.
 */

import { z } from "zod";

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export const MarketMakerStatusSchema = z.enum([
  "pending",
  "active",
  "paused",
  "stopped",
  "liquidated",
]);

export type MarketMakerStatus = z.infer<typeof MarketMakerStatusSchema>;

export const LiquidityPoolTypeSchema = z.enum([
  "single_market",      // Single market liquidity
  "multi_market",       // Spread across multiple markets
  "automated",          // AI-managed allocation
  "index",              // Index-based exposure
]);

export type LiquidityPoolType = z.infer<typeof LiquidityPoolTypeSchema>;

export const RiskLevelSchema = z.enum([
  "conservative",       // 1-2% max spread, tight stops
  "moderate",           // 2-5% spread, moderate risk
  "aggressive",         // 5-10% spread, higher risk
  "custom",             // User-defined parameters
]);

export type RiskLevel = z.infer<typeof RiskLevelSchema>;

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Market Maker Position - represents a user's liquidity position
 */
export interface MarketMakerPosition {
  id: string;
  userId: string;
  marketId: string;
  marketTicker: string;
  marketTitle: string;

  // Position details
  status: MarketMakerStatus;
  poolType: LiquidityPoolType;
  riskLevel: RiskLevel;

  // Capital allocation
  initialCapital: number;
  currentCapital: number;
  reservedCapital: number;    // Locked in active orders
  availableCapital: number;   // Ready to deploy

  // Spread settings
  bidSpread: number;          // Percentage below mid-price
  askSpread: number;          // Percentage above mid-price
  minSpread: number;          // Minimum acceptable spread
  maxSpread: number;          // Maximum spread cap

  // Position limits
  maxPositionSize: number;    // Max size per side
  maxTotalExposure: number;   // Max total market exposure
  currentBidSize: number;     // Current bid orders
  currentAskSize: number;     // Current ask orders
  netPosition: number;        // Net delta

  // Risk controls
  stopLossPercent: number;    // Stop loss trigger
  takeProfitPercent: number;  // Take profit trigger
  maxDrawdownPercent: number; // Max drawdown before pause
  dailyLossLimit: number;     // Daily loss limit

  // Performance
  totalEarnings: number;
  totalVolume: number;
  tradesExecuted: number;
  winningTrades: number;
  losingTrades: number;

  // Timestamps
  createdAt: number;
  activatedAt?: number;
  lastTradeAt?: number;
  pausedAt?: number;
  stoppedAt?: number;
}

/**
 * Market Maker Order - individual order placed by the system
 */
export interface MarketMakerOrder {
  id: string;
  positionId: string;
  userId: string;
  marketId: string;

  // Order details
  side: "bid" | "ask";
  price: number;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;

  // Status
  status: "open" | "partial" | "filled" | "cancelled" | "expired";

  // Pricing
  spreadBps: number;          // Spread in basis points
  expectedProfit: number;     // Expected profit if filled

  // Timestamps
  createdAt: number;
  expiresAt: number;
  filledAt?: number;
  cancelledAt?: number;
}

/**
 * Market Maker Fill - executed trade from market making
 */
export interface MarketMakerFill {
  id: string;
  orderId: string;
  positionId: string;
  userId: string;
  marketId: string;

  // Trade details
  side: "bid" | "ask";
  price: number;
  quantity: number;

  // Profitability
  spreadEarned: number;       // Spread captured
  fees: number;               // Trading fees paid
  netProfit: number;          // Net after fees

  // Counterparty (anonymized)
  counterpartyType: "retail" | "institutional" | "other_mm";

  // Timestamps
  executedAt: number;
  settledAt?: number;
}

/**
 * Market Maker Statistics
 */
export interface MarketMakerStats {
  userId: string;
  period: "daily" | "weekly" | "monthly" | "all_time";

  // Volume stats
  totalVolume: number;
  bidVolume: number;
  askVolume: number;

  // Trade stats
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;

  // Earnings
  grossEarnings: number;
  feesPaid: number;
  netEarnings: number;
  averageSpread: number;

  // Risk metrics
  maxDrawdown: number;
  sharpeRatio: number;
  volatility: number;

  // Position stats
  averagePositionSize: number;
  averageHoldTime: number;    // In seconds
  inventoryTurnover: number;  // Times capital rotated

  // Time in market
  uptimePercent: number;
  quotingPercent: number;     // Time with active quotes
}

/**
 * Market Maker Configuration - user's settings
 */
export interface MarketMakerConfig {
  userId: string;

  // Default settings
  defaultRiskLevel: RiskLevel;
  defaultPoolType: LiquidityPoolType;

  // Spread settings
  defaultBidSpread: number;
  defaultAskSpread: number;
  autoAdjustSpread: boolean;      // Adjust based on volatility
  volatilityMultiplier: number;   // Spread multiplier in high vol

  // Risk management
  globalDailyLossLimit: number;
  globalMaxExposure: number;
  autoStopOnDrawdown: boolean;
  drawdownThreshold: number;

  // Automation
  autoRebalance: boolean;
  rebalanceThreshold: number;     // Rebalance when delta exceeds
  autoCompound: boolean;          // Reinvest earnings

  // Notifications
  notifyOnFill: boolean;
  notifyOnLoss: boolean;
  notifyOnDrawdown: boolean;
  emailAlerts: boolean;
  pushAlerts: boolean;

  // Advanced
  customStrategies: CustomStrategy[];
}

/**
 * Custom Strategy - user-defined market making strategy
 */
export interface CustomStrategy {
  id: string;
  name: string;
  description: string;

  // Entry conditions
  entryConditions: StrategyCondition[];

  // Position sizing
  sizeFormula: string;            // e.g., "capital * 0.1"

  // Spread calculation
  spreadFormula: string;          // e.g., "volatility * 2"

  // Exit conditions
  exitConditions: StrategyCondition[];

  // Enabled
  enabled: boolean;
}

export interface StrategyCondition {
  type: "price" | "volume" | "volatility" | "time" | "position";
  operator: "gt" | "lt" | "eq" | "gte" | "lte" | "between";
  value: number | [number, number];
}

/**
 * Liquidity Pool - shared liquidity pool
 */
export interface LiquidityPool {
  id: string;
  name: string;
  description: string;

  // Pool details
  poolType: LiquidityPoolType;
  marketIds: string[];

  // Capital
  totalCapital: number;
  utilizedCapital: number;
  reservedCapital: number;

  // Participants
  totalParticipants: number;
  minContribution: number;
  maxContribution?: number;

  // Performance
  totalEarnings: number;
  historicalApy: number;
  currentApy: number;

  // Fees
  managementFee: number;          // % annual
  performanceFee: number;         // % of profits

  // Status
  status: "active" | "paused" | "closed";

  // Timestamps
  createdAt: number;
  lastDistributionAt?: number;
}

/**
 * Pool Contribution - user's stake in a pool
 */
export interface PoolContribution {
  id: string;
  userId: string;
  poolId: string;

  // Contribution
  contributedAmount: number;
  currentValue: number;
  sharePercent: number;

  // Earnings
  totalEarnings: number;
  pendingEarnings: number;
  claimedEarnings: number;

  // Status
  status: "active" | "pending_withdrawal" | "withdrawn";

  // Timestamps
  contributedAt: number;
  lastEarningsAt?: number;
  withdrawRequestedAt?: number;
  withdrawnAt?: number;
}

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

export const CreatePositionSchema = z.object({
  marketId: z.string(),
  capital: z.number().positive(),
  riskLevel: RiskLevelSchema.optional().default("moderate"),
  bidSpread: z.number().min(0.001).max(0.5).optional().default(0.02),
  askSpread: z.number().min(0.001).max(0.5).optional().default(0.02),
  maxPositionSize: z.number().positive(),
  stopLossPercent: z.number().min(0.01).max(0.5).optional().default(0.1),
  takeProfitPercent: z.number().min(0.01).max(1.0).optional(),
});

export type CreatePositionInput = z.infer<typeof CreatePositionSchema>;

export const UpdatePositionSchema = z.object({
  positionId: z.string(),
  bidSpread: z.number().min(0.001).max(0.5).optional(),
  askSpread: z.number().min(0.001).max(0.5).optional(),
  maxPositionSize: z.number().positive().optional(),
  stopLossPercent: z.number().min(0.01).max(0.5).optional(),
  takeProfitPercent: z.number().min(0.01).max(1.0).optional(),
  riskLevel: RiskLevelSchema.optional(),
});

export type UpdatePositionInput = z.infer<typeof UpdatePositionSchema>;

export const JoinPoolSchema = z.object({
  poolId: z.string(),
  amount: z.number().positive(),
});

export type JoinPoolInput = z.infer<typeof JoinPoolSchema>;

export const WithdrawPoolSchema = z.object({
  contributionId: z.string(),
  amount: z.number().positive().optional(),  // If not provided, withdraw all
});

export type WithdrawPoolInput = z.infer<typeof WithdrawPoolSchema>;
