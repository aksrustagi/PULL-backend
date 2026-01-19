/**
 * KYC Gate Middleware
 *
 * Restricts access to endpoints based on user's KYC tier.
 * Different features require different levels of verification.
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../types";

type KYCTier = "none" | "basic" | "enhanced" | "accredited";

const TIER_LEVELS: Record<KYCTier, number> = {
  none: 0,
  basic: 1,
  enhanced: 2,
  accredited: 3,
};

interface KYCGateConfig {
  minTier: KYCTier;
  allowPending?: boolean;
  customMessage?: string;
}

/**
 * KYC gate middleware factory
 */
export function kycGate(config: KYCGateConfig) {
  const { minTier, allowPending = false, customMessage } = config;
  const minTierLevel = TIER_LEVELS[minTier];

  return createMiddleware<Env>(async (c, next) => {
    const kycTier = c.get("kycTier") as KYCTier | undefined;
    const kycStatus = c.get("kycStatus") as string | undefined;

    // Check if user is authenticated
    if (!kycTier || !kycStatus) {
      throw new HTTPException(401, {
        message: "Authentication required",
      });
    }

    // Check KYC status
    if (kycStatus === "rejected") {
      throw new HTTPException(403, {
        message:
          "Your KYC verification was rejected. Please contact support.",
      });
    }

    if (kycStatus === "pending" && !allowPending) {
      throw new HTTPException(403, {
        message:
          "Please complete KYC verification to access this feature.",
      });
    }

    if (kycStatus === "review") {
      throw new HTTPException(403, {
        message:
          "Your account is under review. This typically takes 1-2 business days.",
      });
    }

    // Check tier level
    const userTierLevel = TIER_LEVELS[kycTier] || 0;

    if (userTierLevel < minTierLevel) {
      const message =
        customMessage ||
        `This feature requires ${minTier} KYC verification. Your current tier: ${kycTier}`;

      throw new HTTPException(403, {
        message,
      });
    }

    await next();
  });
}

/**
 * Trading limits by KYC tier
 */
export const TRADING_LIMITS: Record<
  KYCTier,
  {
    dailyLimit: number;
    weeklyLimit: number;
    singleOrderLimit: number;
    allowedAssetTypes: string[];
  }
> = {
  none: {
    dailyLimit: 0,
    weeklyLimit: 0,
    singleOrderLimit: 0,
    allowedAssetTypes: [],
  },
  basic: {
    dailyLimit: 1000,
    weeklyLimit: 5000,
    singleOrderLimit: 500,
    allowedAssetTypes: ["prediction", "crypto"],
  },
  enhanced: {
    dailyLimit: 10000,
    weeklyLimit: 50000,
    singleOrderLimit: 5000,
    allowedAssetTypes: ["prediction", "crypto", "rwa"],
  },
  accredited: {
    dailyLimit: 100000,
    weeklyLimit: 500000,
    singleOrderLimit: 50000,
    allowedAssetTypes: ["prediction", "crypto", "rwa"],
  },
};

/**
 * Get trading limits for a user
 */
export function getTradingLimits(kycTier: KYCTier) {
  return TRADING_LIMITS[kycTier] || TRADING_LIMITS.none;
}

/**
 * Check if trade is within limits
 */
export function isTradeWithinLimits(
  kycTier: KYCTier,
  assetType: string,
  amount: number,
  dailyTotal: number,
  weeklyTotal: number
): { allowed: boolean; reason?: string } {
  const limits = getTradingLimits(kycTier);

  // Check asset type
  if (!limits.allowedAssetTypes.includes(assetType)) {
    return {
      allowed: false,
      reason: `Your KYC tier (${kycTier}) does not allow trading ${assetType} assets`,
    };
  }

  // Check single order limit
  if (amount > limits.singleOrderLimit) {
    return {
      allowed: false,
      reason: `Order amount ($${amount}) exceeds single order limit ($${limits.singleOrderLimit})`,
    };
  }

  // Check daily limit
  if (dailyTotal + amount > limits.dailyLimit) {
    return {
      allowed: false,
      reason: `This order would exceed your daily limit of $${limits.dailyLimit}`,
    };
  }

  // Check weekly limit
  if (weeklyTotal + amount > limits.weeklyLimit) {
    return {
      allowed: false,
      reason: `This order would exceed your weekly limit of $${limits.weeklyLimit}`,
    };
  }

  return { allowed: true };
}
