/**
 * Input Validation for Temporal Workflows
 * Uses Zod for runtime validation with TypeScript type inference
 */

import { z } from "zod";
import { validationError } from "./errors";
import { THRESHOLDS, KYC } from "./config";

// ============================================================================
// Common Validation Schemas
// ============================================================================

/**
 * Email address validation
 */
export const emailSchema = z
  .string()
  .email("Invalid email address format")
  .min(5, "Email too short")
  .max(254, "Email too long");

/**
 * UUID validation
 */
export const uuidSchema = z
  .string()
  .uuid("Invalid UUID format");

/**
 * User ID validation (supports multiple formats)
 */
export const userIdSchema = z
  .string()
  .min(1, "User ID is required")
  .regex(/^(user_)?[a-zA-Z0-9_-]+$/, "Invalid user ID format");

/**
 * Wallet address validation (Ethereum)
 */
export const ethAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address");

/**
 * Wallet address validation (supports multiple chains)
 */
export const walletAddressSchema = z.union([
  ethAddressSchema,
  z.string().regex(/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/, "Invalid Bitcoin address"),
  z.string().regex(/^[a-zA-Z0-9]{32,44}$/, "Invalid Solana address"),
]);

/**
 * Positive amount validation
 */
export const positiveAmountSchema = z
  .number()
  .positive("Amount must be positive");

/**
 * Currency amount with range validation
 */
export const currencyAmountSchema = (min: number, max: number) =>
  z
    .number()
    .min(min, `Amount must be at least $${min}`)
    .max(max, `Amount cannot exceed $${max}`);

/**
 * Percentage validation (0-100)
 */
export const percentageSchema = z
  .number()
  .min(0, "Percentage cannot be negative")
  .max(100, "Percentage cannot exceed 100");

/**
 * Positive integer validation
 */
export const positiveIntegerSchema = z
  .number()
  .int("Must be a whole number")
  .positive("Must be positive");

// ============================================================================
// KYC Workflow Schemas
// ============================================================================

export const accountCreationInputSchema = z.object({
  email: emailSchema,
  referralCode: z
    .string()
    .regex(/^[A-Z0-9]{6,12}$/, "Invalid referral code format")
    .optional(),
  walletAddress: walletAddressSchema.optional(),
});

export type AccountCreationInput = z.infer<typeof accountCreationInputSchema>;

export const kycUpgradeInputSchema = z.object({
  userId: userIdSchema,
  targetTier: z.enum(["enhanced", "accredited"]),
  documents: z.array(z.string()).optional(),
});

export type KYCUpgradeInput = z.infer<typeof kycUpgradeInputSchema>;

// ============================================================================
// Trading Workflow Schemas
// ============================================================================

export const orderExecutionInputSchema = z.object({
  userId: userIdSchema,
  assetType: z.enum(["prediction", "rwa", "crypto"]),
  assetId: z.string().min(1, "Asset ID is required"),
  side: z.enum(["buy", "sell"]),
  orderType: z.enum(["market", "limit"]),
  quantity: positiveIntegerSchema,
  limitPrice: positiveAmountSchema.optional(),
}).refine(
  (data) => data.orderType !== "limit" || data.limitPrice !== undefined,
  {
    message: "Limit price is required for limit orders",
    path: ["limitPrice"],
  }
);

export type OrderExecutionInput = z.infer<typeof orderExecutionInputSchema>;

export const depositInputSchema = z.object({
  userId: userIdSchema,
  amount: currencyAmountSchema(THRESHOLDS.DEPOSIT.MINIMUM, THRESHOLDS.DEPOSIT.MAXIMUM),
  plaidAccessToken: z.string().min(1, "Plaid access token is required"),
  accountId: z.string().min(1, "Account ID is required"),
});

export type DepositInput = z.infer<typeof depositInputSchema>;

export const withdrawalInputSchema = z.object({
  userId: userIdSchema,
  amount: currencyAmountSchema(THRESHOLDS.WITHDRAWAL.MINIMUM, THRESHOLDS.WITHDRAWAL.MAXIMUM),
  destinationAccountId: z.string().min(1, "Destination account ID is required"),
});

export type WithdrawalInput = z.infer<typeof withdrawalInputSchema>;

export const settlementInputSchema = z.object({
  eventId: z.string().min(1, "Event ID is required"),
  outcome: z.string().min(1, "Outcome is required"),
  settlementTime: z.string().datetime("Invalid settlement time format"),
});

export type SettlementInput = z.infer<typeof settlementInputSchema>;

// ============================================================================
// RWA Workflow Schemas
// ============================================================================

export const gradingCompanySchema = z.enum(["PSA", "BGS", "CGC"]);

export const assetDetailsSchema = z.object({
  name: z.string().min(1, "Asset name is required").max(200, "Asset name too long"),
  grade: z.string().regex(/^([\d.]+|GEM MINT|MINT|NM|EX|VG|G|FR|PR)$/i, "Invalid grade format"),
  gradingCompany: gradingCompanySchema,
  certNumber: z.string().regex(/^\d{6,12}$/, "Invalid certificate number"),
  images: z.array(z.string().url("Invalid image URL")).min(1, "At least one image is required"),
  description: z.string().max(2000, "Description too long").optional(),
  year: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  setName: z.string().max(100).optional(),
  cardNumber: z.string().max(50).optional(),
});

export const assetListingInputSchema = z.object({
  sellerId: userIdSchema,
  assetType: z.enum(["pokemon_card", "sports_card", "collectible"]),
  assetDetails: assetDetailsSchema,
  totalShares: positiveIntegerSchema.max(10000, "Maximum 10,000 shares allowed"),
  pricePerShare: currencyAmountSchema(0.01, 100000),
});

export type AssetListingInput = z.infer<typeof assetListingInputSchema>;

export const rwaPurchaseInputSchema = z.object({
  listingId: z.string().min(1, "Listing ID is required"),
  buyerId: userIdSchema,
  shares: positiveIntegerSchema,
});

export type RWAPurchaseInput = z.infer<typeof rwaPurchaseInputSchema>;

// ============================================================================
// Rewards Workflow Schemas
// ============================================================================

export const earnPointsInputSchema = z.object({
  userId: userIdSchema,
  action: z.enum([
    "daily_login",
    "trade_executed",
    "deposit",
    "referral_signup",
    "referral_trade",
    "rwa_purchase",
    "email_connected",
    "profile_completed",
    "kyc_upgraded",
    "streak_bonus",
  ]),
  metadata: z.record(z.unknown()).optional(),
});

export type EarnPointsInput = z.infer<typeof earnPointsInputSchema>;

export const redeemPointsInputSchema = z.object({
  userId: userIdSchema,
  rewardId: z.string().min(1, "Reward ID is required"),
  pointsCost: positiveIntegerSchema,
  redemptionType: z.enum(["sweepstakes", "prize", "token", "fee_discount"]),
});

export type RedeemPointsInput = z.infer<typeof redeemPointsInputSchema>;

export const tokenConversionInputSchema = z.object({
  userId: userIdSchema,
  pointsAmount: positiveIntegerSchema.min(100, "Minimum 100 points required for conversion"),
  walletAddress: ethAddressSchema,
});

export type TokenConversionInput = z.infer<typeof tokenConversionInputSchema>;

// ============================================================================
// Email Workflow Schemas
// ============================================================================

export const emailSyncInputSchema = z.object({
  userId: userIdSchema,
  grantId: z.string().min(1, "Grant ID is required"),
  syncCursor: z.string().optional(),
  isInitialSync: z.boolean().optional(),
});

export type EmailSyncInput = z.infer<typeof emailSyncInputSchema>;

export const emailTriageInputSchema = z.object({
  emailId: z.string().min(1, "Email ID is required"),
  emailContent: z.object({
    subject: z.string().max(998, "Subject too long"),
    body: z.string().max(1000000, "Email body too large"),
    from: emailSchema,
    to: z.array(emailSchema).min(1, "At least one recipient required"),
    receivedAt: z.string().datetime("Invalid received date"),
  }),
});

export type EmailTriageInput = z.infer<typeof emailTriageInputSchema>;

export const smartReplyInputSchema = z.object({
  threadId: z.string().min(1, "Thread ID is required"),
  userId: userIdSchema,
});

export type SmartReplyInput = z.infer<typeof smartReplyInputSchema>;

// ============================================================================
// Messaging Workflow Schemas
// ============================================================================

export const roomCreationInputSchema = z.object({
  creatorId: userIdSchema,
  roomName: z
    .string()
    .min(1, "Room name is required")
    .max(100, "Room name too long")
    .regex(/^[a-zA-Z0-9\s_-]+$/, "Room name contains invalid characters"),
  roomType: z.enum(["dm", "group", "channel"]),
  invitees: z.array(userIdSchema).max(100, "Maximum 100 invitees allowed"),
  settings: z
    .object({
      encrypted: z.boolean().optional(),
      historyVisibility: z.enum(["shared", "invited", "joined"]).optional(),
      guestAccess: z.boolean().optional(),
      topic: z.string().max(500).optional(),
      avatar: z.string().url().optional(),
    })
    .optional(),
});

export type RoomCreationInput = z.infer<typeof roomCreationInputSchema>;

export const bridgeMessageInputSchema = z.object({
  roomId: z.string().min(1, "Room ID is required"),
  senderId: userIdSchema,
  messageContent: z.string().min(1, "Message cannot be empty").max(10000, "Message too long"),
  messageType: z.enum(["text", "command", "trade"]),
});

export type BridgeMessageInput = z.infer<typeof bridgeMessageInputSchema>;

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Validate input and throw a workflow-friendly error if invalid
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
  inputName = "input"
): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");

    throw validationError(`Invalid ${inputName}: ${errors}`, {
      inputName,
      errors: result.error.errors,
    });
  }

  return result.data;
}

/**
 * Validate input and return result (non-throwing)
 */
export function safeValidateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError["errors"] } {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: result.error.errors };
}

/**
 * Validate partial input (useful for updates)
 */
export function validatePartialInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
  inputName = "input"
): Partial<T> {
  // Create a partial version of the schema
  const partialSchema = schema.partial() as z.ZodSchema<Partial<T>>;
  return validateInput(partialSchema, input, inputName);
}
