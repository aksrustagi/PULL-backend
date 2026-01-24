import { z } from "zod";

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

/**
 * Standard error response schema
 */
export const ErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().describe("Machine-readable error code"),
    message: z.string().describe("Human-readable error message"),
  }),
  requestId: z.string().uuid().optional().describe("Request tracking ID"),
  timestamp: z.string().datetime().describe("ISO 8601 timestamp"),
});

/**
 * Standard pagination schema
 */
export const PaginationSchema = z.object({
  page: z.number().int().min(1).describe("Current page number (1-indexed)"),
  pageSize: z.number().int().min(1).max(100).describe("Number of items per page"),
  totalItems: z.number().int().min(0).describe("Total number of items"),
  totalPages: z.number().int().min(0).describe("Total number of pages"),
  hasNextPage: z.boolean().describe("Whether there is a next page"),
  hasPreviousPage: z.boolean().describe("Whether there is a previous page"),
});

/**
 * Standard success response wrapper
 */
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    requestId: z.string().uuid().optional(),
    timestamp: z.string().datetime(),
  });

/**
 * Paginated response wrapper
 */
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    success: z.literal(true),
    data: z.array(itemSchema),
    pagination: PaginationSchema,
    timestamp: z.string().datetime(),
  });

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

/**
 * User registration request
 */
export const RegisterRequestSchema = z.object({
  email: z.string().email("Invalid email address").describe("User email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    )
    .describe("User password (min 8 chars, must include uppercase, lowercase, and number)"),
  displayName: z
    .string()
    .min(2)
    .max(50)
    .optional()
    .describe("Optional display name"),
  referralCode: z.string().optional().describe("Optional referral code from another user"),
});

/**
 * User login request
 */
export const LoginRequestSchema = z.object({
  email: z.string().email("Invalid email address").describe("User email address"),
  password: z.string().min(1, "Password is required").describe("User password"),
});

/**
 * Forgot password request
 */
export const ForgotPasswordRequestSchema = z.object({
  email: z.string().email("Invalid email address").describe("Email address associated with the account"),
});

/**
 * Reset password request
 */
export const ResetPasswordRequestSchema = z.object({
  token: z.string().describe("Password reset token from email"),
  password: z
    .string()
    .min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .describe("New password"),
  confirmPassword: z.string().describe("Password confirmation"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

/**
 * User profile schema
 */
export const UserSchema = z.object({
  id: z.string().describe("Unique user ID"),
  email: z.string().email().describe("User email address"),
  displayName: z.string().optional().describe("User display name"),
  username: z.string().optional().describe("Unique username"),
  avatarUrl: z.string().url().optional().describe("URL to user avatar image"),
  emailVerified: z.boolean().describe("Whether email has been verified"),
  kycStatus: z
    .enum(["none", "pending", "approved", "rejected"])
    .describe("KYC verification status"),
  kycTier: z.number().int().min(0).max(3).describe("KYC tier level (0-3)"),
  referralCode: z.string().optional().describe("User's referral code for inviting others"),
  lastLoginAt: z.string().datetime().nullable().optional().describe("Last login timestamp"),
  createdAt: z.string().datetime().describe("Account creation timestamp"),
});

/**
 * Auth response with user and token
 */
export const AuthResponseSchema = z.object({
  user: UserSchema,
  token: z.string().describe("JWT authentication token"),
});

// ============================================================================
// TRADING SCHEMAS
// ============================================================================

/**
 * Asset class enum
 */
export const AssetClassSchema = z.enum(["crypto", "prediction", "rwa"]);

/**
 * Order side enum
 */
export const OrderSideSchema = z.enum(["buy", "sell"]);

/**
 * Order type enum
 */
export const OrderTypeSchema = z.enum(["market", "limit", "stop", "stop_limit"]);

/**
 * Time in force enum
 */
export const TimeInForceSchema = z.enum(["day", "gtc", "ioc", "fok"]);

/**
 * Order status enum
 */
export const OrderStatusSchema = z.enum([
  "pending",
  "submitted",
  "accepted",
  "partial_fill",
  "filled",
  "cancelled",
  "rejected",
  "expired",
]);

/**
 * Create order request
 */
export const CreateOrderRequestSchema = z
  .object({
    assetClass: AssetClassSchema.describe("Asset class for the order"),
    symbol: z.string().describe("Trading symbol/ticker"),
    side: OrderSideSchema.describe("Order side (buy or sell)"),
    type: OrderTypeSchema.describe("Order type"),
    quantity: z.number().positive("Quantity must be positive").describe("Order quantity"),
    price: z.number().positive().optional().describe("Limit price (required for limit and stop_limit orders)"),
    stopPrice: z
      .number()
      .positive()
      .optional()
      .describe("Stop trigger price (required for stop and stop_limit orders)"),
    timeInForce: TimeInForceSchema.default("gtc").describe("Time in force"),
    clientOrderId: z.string().optional().describe("Client-provided order ID for tracking"),
    expiresAt: z.number().optional().describe("Unix timestamp when the order should expire"),
    metadata: z.record(z.unknown()).optional().describe("Additional metadata for the order"),
  })
  .refine(
    (data) => {
      if (data.type === "limit" || data.type === "stop_limit") {
        return data.price !== undefined;
      }
      return true;
    },
    { message: "Limit orders require a price", path: ["price"] }
  )
  .refine(
    (data) => {
      if (data.type === "stop" || data.type === "stop_limit") {
        return data.stopPrice !== undefined;
      }
      return true;
    },
    { message: "Stop orders require a stop price", path: ["stopPrice"] }
  );

/**
 * Order schema
 */
export const OrderSchema = z.object({
  id: z.string().describe("Unique order ID"),
  userId: z.string().describe("User ID who placed the order"),
  assetClass: AssetClassSchema,
  symbol: z.string().describe("Trading symbol"),
  side: OrderSideSchema,
  type: OrderTypeSchema,
  quantity: z.number().describe("Order quantity"),
  price: z.number().nullable().optional().describe("Limit price"),
  stopPrice: z.number().nullable().optional().describe("Stop price"),
  timeInForce: TimeInForceSchema,
  status: OrderStatusSchema.describe("Current order status"),
  filledQuantity: z.number().default(0).describe("Quantity that has been filled"),
  averagePrice: z.number().nullable().optional().describe("Average fill price"),
  clientOrderId: z.string().nullable().optional().describe("Client-provided order ID"),
  createdAt: z.string().datetime().describe("Order creation timestamp"),
  updatedAt: z.string().datetime().optional().describe("Last update timestamp"),
});

/**
 * Order fill schema
 */
export const OrderFillSchema = z.object({
  id: z.string().describe("Fill ID"),
  price: z.number().describe("Fill price"),
  quantity: z.number().describe("Fill quantity"),
  fee: z.number().describe("Transaction fee"),
  timestamp: z.string().datetime().describe("Fill timestamp"),
});

/**
 * Order with fills
 */
export const OrderWithFillsSchema = OrderSchema.extend({
  fills: z.array(OrderFillSchema).default([]).describe("List of order fills"),
});

/**
 * Portfolio position
 */
export const PositionSchema = z.object({
  symbol: z.string().describe("Position symbol"),
  assetClass: AssetClassSchema,
  quantity: z.number().describe("Position quantity"),
  averageCost: z.number().describe("Average cost per unit"),
  currentPrice: z.number().describe("Current market price"),
  marketValue: z.number().describe("Current market value"),
  unrealizedPnL: z.number().describe("Unrealized profit/loss"),
  unrealizedPnLPercent: z.number().describe("Unrealized P&L percentage"),
});

/**
 * Portfolio summary
 */
export const PortfolioSummarySchema = z.object({
  totalValue: z.number().describe("Total portfolio value"),
  totalCost: z.number().describe("Total cost basis"),
  totalUnrealizedPnL: z.number().describe("Total unrealized profit/loss"),
  totalRealizedPnL: z.number().describe("Total realized profit/loss"),
  totalPnLPercent: z.number().describe("Total P&L percentage"),
  positionCount: z.number().int().describe("Number of open positions"),
});

/**
 * Full portfolio
 */
export const PortfolioSchema = z.object({
  positions: z.array(PositionSchema).describe("List of portfolio positions"),
  summary: PortfolioSummarySchema.describe("Portfolio summary"),
});

/**
 * Buying power
 */
export const BuyingPowerSchema = z.object({
  available: z.number().describe("Available buying power"),
  held: z.number().describe("Amount held in open orders"),
  pending: z.number().describe("Pending deposits/withdrawals"),
  total: z.number().describe("Total buying power"),
});

/**
 * Get orders query parameters
 */
export const GetOrdersQuerySchema = z.object({
  status: OrderStatusSchema.optional().describe("Filter by order status"),
  limit: z.coerce.number().min(1).max(100).default(50).describe("Number of items per page"),
  offset: z.coerce.number().min(0).default(0).describe("Number of items to skip"),
});

// ============================================================================
// PREDICTION SCHEMAS
// ============================================================================

/**
 * Prediction event status
 */
export const PredictionEventStatusSchema = z.enum(["upcoming", "active", "resolved", "cancelled"]);

/**
 * Prediction event
 */
export const PredictionEventSchema = z.object({
  id: z.string().describe("Unique event ID"),
  ticker: z.string().describe("Event ticker symbol"),
  title: z.string().describe("Event title"),
  description: z.string().optional().describe("Detailed event description"),
  status: PredictionEventStatusSchema.describe("Event status"),
  category: z.string().describe("Event category"),
  imageUrl: z.string().url().optional().describe("Event image URL"),
  startDate: z.string().datetime().optional().describe("Event start date"),
  endDate: z.string().datetime().optional().describe("Event end date"),
  resolutionDate: z.string().datetime().nullable().optional().describe("Resolution date"),
  volume: z.number().optional().describe("Total trading volume"),
  markets: z.array(z.lazy(() => PredictionMarketSchema)).optional().describe("Associated markets"),
});

/**
 * Prediction market
 */
export const PredictionMarketSchema = z.object({
  id: z.string().describe("Market ID"),
  ticker: z.string().describe("Market ticker"),
  question: z.string().describe("Market question"),
  yesPrice: z.number().min(0).max(1).describe("Current YES price (0-1)"),
  noPrice: z.number().min(0).max(1).describe("Current NO price (0-1)"),
  volume: z.number().optional().describe("Market trading volume"),
  liquidity: z.number().optional().describe("Market liquidity"),
});

/**
 * Prediction position
 */
export const PredictionPositionSchema = z.object({
  marketId: z.string().describe("Market ID"),
  ticker: z.string().describe("Market ticker"),
  side: z.enum(["yes", "no"]).describe("Position side"),
  quantity: z.number().describe("Number of contracts"),
  averageCost: z.number().describe("Average cost per contract"),
  currentPrice: z.number().optional().describe("Current market price"),
  unrealizedPnL: z.number().optional().describe("Unrealized P&L"),
});

/**
 * Category
 */
export const CategorySchema = z.object({
  id: z.string().describe("Category ID"),
  name: z.string().describe("Category display name"),
  count: z.number().int().describe("Number of events in category"),
});

/**
 * Get events query parameters
 */
export const GetEventsQuerySchema = z.object({
  status: z.string().optional().describe("Filter by event status"),
  category: z.string().optional().describe("Filter by category"),
  limit: z.coerce.number().min(1).max(100).default(50).describe("Number of items to return"),
});

/**
 * Search events query parameters
 */
export const SearchEventsQuerySchema = z.object({
  q: z.string().min(1).describe("Search query"),
  status: z.string().optional().describe("Filter by status"),
  category: z.string().optional().describe("Filter by category"),
  limit: z.coerce.number().min(1).max(100).default(20).describe("Number of items to return"),
});

// ============================================================================
// RWA SCHEMAS
// ============================================================================

/**
 * RWA asset type
 */
export const RWAAssetTypeSchema = z.enum([
  "real_estate",
  "art",
  "collectibles",
  "commodities",
  "equipment",
]);

/**
 * RWA asset status
 */
export const RWAAssetStatusSchema = z.enum([
  "draft",
  "listed",
  "funded",
  "active",
  "liquidated",
]);

/**
 * RWA asset document
 */
export const RWADocumentSchema = z.object({
  name: z.string().describe("Document name"),
  url: z.string().url().describe("Document URL"),
});

/**
 * RWA asset
 */
export const RWAAssetSchema = z.object({
  id: z.string().describe("Asset ID"),
  name: z.string().describe("Asset name"),
  description: z.string().optional().describe("Asset description"),
  type: RWAAssetTypeSchema.describe("Asset type"),
  status: RWAAssetStatusSchema.describe("Asset status"),
  totalShares: z.number().int().describe("Total number of shares"),
  availableShares: z.number().int().optional().describe("Available shares for purchase"),
  pricePerShare: z.number().describe("Current price per share"),
  totalValue: z.number().optional().describe("Total asset value"),
  annualYield: z.number().optional().describe("Expected annual yield percentage"),
  imageUrl: z.string().url().optional().describe("Asset image URL"),
  documents: z.array(RWADocumentSchema).optional().describe("Asset documents"),
});

/**
 * RWA listing status
 */
export const RWAListingStatusSchema = z.enum(["active", "sold", "cancelled"]);

/**
 * RWA listing
 */
export const RWAListingSchema = z.object({
  id: z.string().describe("Listing ID"),
  assetId: z.string().describe("Associated asset ID"),
  sellerId: z.string().optional().describe("Seller user ID"),
  shares: z.number().int().describe("Number of shares listed"),
  pricePerShare: z.number().describe("Price per share"),
  status: RWAListingStatusSchema.describe("Listing status"),
});

/**
 * RWA ownership
 */
export const RWAOwnershipSchema = z.object({
  assetId: z.string().describe("Asset ID"),
  asset: RWAAssetSchema.optional().describe("Asset details"),
  shares: z.number().int().describe("Number of shares owned"),
  averageCost: z.number().describe("Average cost per share"),
  currentValue: z.number().optional().describe("Current value of holdings"),
  unrealizedPnL: z.number().optional().describe("Unrealized profit/loss"),
});

/**
 * Purchase request
 */
export const PurchaseRequestSchema = z.object({
  listingId: z.string().describe("Listing ID to purchase from"),
  shares: z.number().int().positive().describe("Number of shares to purchase"),
});

/**
 * Get assets query parameters
 */
export const GetAssetsQuerySchema = z.object({
  type: z.string().optional().describe("Filter by asset type"),
  status: z.string().default("listed").describe("Filter by status"),
  limit: z.coerce.number().min(1).max(100).default(50).describe("Number of items to return"),
});

/**
 * Search assets query parameters
 */
export const SearchAssetsQuerySchema = z.object({
  q: z.string().min(1).describe("Search query"),
  type: z.string().optional().describe("Filter by asset type"),
  limit: z.coerce.number().min(1).max(100).default(20).describe("Number of items to return"),
});

// ============================================================================
// REWARDS SCHEMAS
// ============================================================================

/**
 * Rewards tier
 */
export const RewardsTierSchema = z.enum(["bronze", "silver", "gold", "platinum"]);

/**
 * Points transaction type
 */
export const PointsTransactionTypeSchema = z.enum([
  "earned",
  "spent",
  "bonus",
  "referral",
  "adjustment",
]);

/**
 * Rewards balance
 */
export const RewardsBalanceSchema = z.object({
  available: z.number().int().describe("Available points balance"),
  pending: z.number().int().describe("Pending points (not yet available)"),
  lifetime: z.number().int().describe("Total lifetime points earned"),
  tier: RewardsTierSchema.optional().describe("Current rewards tier"),
  nextTierProgress: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Progress to next tier (percentage)"),
});

/**
 * Points transaction
 */
export const PointsTransactionSchema = z.object({
  id: z.string().describe("Transaction ID"),
  type: PointsTransactionTypeSchema.describe("Transaction type"),
  amount: z.number().int().describe("Points amount (positive for credit, negative for debit)"),
  description: z.string().optional().describe("Transaction description"),
  referenceId: z.string().optional().describe("Reference ID (order, redemption, etc.)"),
  timestamp: z.string().datetime().describe("Transaction timestamp"),
});

/**
 * Reward status
 */
export const RewardStatusSchema = z.enum(["active", "inactive", "out_of_stock"]);

/**
 * Reward
 */
export const RewardSchema = z.object({
  id: z.string().describe("Reward ID"),
  name: z.string().describe("Reward name"),
  description: z.string().optional().describe("Reward description"),
  pointsCost: z.number().int().describe("Points required to redeem"),
  category: z.string().describe("Reward category"),
  imageUrl: z.string().url().optional().describe("Reward image URL"),
  status: RewardStatusSchema.describe("Reward status"),
  featured: z.boolean().optional().describe("Whether reward is featured"),
  stock: z.number().int().nullable().optional().describe("Available stock (null for unlimited)"),
});

/**
 * Shipping address for physical rewards
 */
export const ShippingAddressSchema = z.object({
  name: z.string().describe("Recipient name"),
  addressLine1: z.string().describe("Street address"),
  addressLine2: z.string().optional().describe("Apartment, suite, etc."),
  city: z.string().describe("City"),
  state: z.string().describe("State/Province"),
  postalCode: z.string().describe("Postal/ZIP code"),
  country: z.string().describe("Country code"),
});

/**
 * Redeem reward request
 */
export const RedeemRequestSchema = z.object({
  rewardId: z.string().describe("ID of the reward to redeem"),
  quantity: z.number().int().positive().default(1).describe("Quantity to redeem"),
  shippingAddress: ShippingAddressSchema.optional().describe("Required for physical rewards"),
});

/**
 * Leaderboard entry
 */
export const LeaderboardEntrySchema = z.object({
  rank: z.number().int().describe("Leaderboard rank"),
  userId: z.string().describe("User ID"),
  displayName: z.string().describe("User display name"),
  avatarUrl: z.string().url().optional().describe("User avatar URL"),
  points: z.number().int().describe("Points earned in period"),
  tier: z.string().optional().describe("User tier"),
});

/**
 * Daily streak response
 */
export const DailyStreakResponseSchema = z.object({
  bonusAmount: z.number().int().describe("Points earned from streak bonus"),
  streakDays: z.number().int().describe("Current streak in days"),
});

/**
 * Get history query parameters
 */
export const GetHistoryQuerySchema = z.object({
  type: z.string().optional().describe("Filter by transaction type"),
  limit: z.coerce.number().min(1).max(100).default(50).describe("Number of items per page"),
  offset: z.coerce.number().min(0).default(0).describe("Number of items to skip"),
  page: z.coerce.number().min(1).default(1).describe("Page number"),
});

/**
 * Get catalog query parameters
 */
export const GetCatalogQuerySchema = z.object({
  category: z.string().optional().describe("Filter by category"),
  featured: z.coerce.boolean().optional().describe("Only show featured rewards"),
});

/**
 * Get leaderboard query parameters
 */
export const GetLeaderboardQuerySchema = z.object({
  period: z
    .enum(["daily", "weekly", "monthly", "all_time"])
    .default("weekly")
    .describe("Time period for leaderboard"),
  limit: z.coerce.number().min(1).max(100).default(100).describe("Number of entries to return"),
});

// ============================================================================
// EXPORT ALL SCHEMAS
// ============================================================================

export const schemas = {
  // Common
  ErrorSchema,
  PaginationSchema,

  // Auth
  RegisterRequestSchema,
  LoginRequestSchema,
  ForgotPasswordRequestSchema,
  ResetPasswordRequestSchema,
  UserSchema,
  AuthResponseSchema,

  // Trading
  CreateOrderRequestSchema,
  OrderSchema,
  OrderWithFillsSchema,
  PositionSchema,
  PortfolioSchema,
  BuyingPowerSchema,
  GetOrdersQuerySchema,

  // Predictions
  PredictionEventSchema,
  PredictionMarketSchema,
  PredictionPositionSchema,
  CategorySchema,
  GetEventsQuerySchema,
  SearchEventsQuerySchema,

  // RWA
  RWAAssetSchema,
  RWAListingSchema,
  RWAOwnershipSchema,
  PurchaseRequestSchema,
  GetAssetsQuerySchema,
  SearchAssetsQuerySchema,

  // Rewards
  RewardsBalanceSchema,
  PointsTransactionSchema,
  RewardSchema,
  RedeemRequestSchema,
  LeaderboardEntrySchema,
  DailyStreakResponseSchema,
  GetHistoryQuerySchema,
  GetCatalogQuerySchema,
  GetLeaderboardQuerySchema,
};

export default schemas;
