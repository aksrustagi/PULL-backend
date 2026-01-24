/**
 * Persona KYC Templates
 * Template configuration for different KYC tiers
 */

// ============================================================================
// KYC Tier Definitions
// ============================================================================

export enum KycTier {
  BASIC = "basic",           // Email + phone verification
  STANDARD = "standard",     // + Government ID
  ENHANCED = "enhanced",     // + Selfie verification
  ACCREDITED = "accredited", // + Accredited investor verification
}

// ============================================================================
// Template IDs
// ============================================================================

// Template IDs MUST be set via environment variables - no fallback to prevent
// using invalid placeholder IDs in production
function requireTemplateId(envVar: string, tier: string): string {
  const value = process.env[envVar];
  if (!value) {
    throw new Error(
      `FATAL: ${envVar} environment variable is required for KYC tier "${tier}". ` +
      "Configure valid Persona template IDs in your deployment."
    );
  }
  return value;
}

export const TEMPLATE_IDS: Record<KycTier, string> = {
  [KycTier.BASIC]: requireTemplateId("PERSONA_TEMPLATE_BASIC", "basic"),
  [KycTier.STANDARD]: requireTemplateId("PERSONA_TEMPLATE_STANDARD", "standard"),
  [KycTier.ENHANCED]: requireTemplateId("PERSONA_TEMPLATE_ENHANCED", "enhanced"),
  [KycTier.ACCREDITED]: requireTemplateId("PERSONA_TEMPLATE_ACCREDITED", "accredited"),
};

// ============================================================================
// Required Fields per Template
// ============================================================================

export interface TemplateRequiredFields {
  templateId: string;
  tier: KycTier;
  requiredFields: string[];
  optionalFields: string[];
  verifications: string[];
  limits: TierLimits;
}

export interface TierLimits {
  dailyDeposit: number;
  dailyWithdrawal: number;
  dailyTrading: number;
  monthlyDeposit: number;
  monthlyWithdrawal: number;
  singleTradeMax: number;
}

export const TEMPLATE_CONFIGS: Record<KycTier, TemplateRequiredFields> = {
  [KycTier.BASIC]: {
    templateId: TEMPLATE_IDS[KycTier.BASIC],
    tier: KycTier.BASIC,
    requiredFields: [
      "email_address",
      "phone_number",
      "name_first",
      "name_last",
    ],
    optionalFields: [
      "name_middle",
    ],
    verifications: [
      "email",
      "phone",
    ],
    limits: {
      dailyDeposit: 1000,
      dailyWithdrawal: 500,
      dailyTrading: 5000,
      monthlyDeposit: 5000,
      monthlyWithdrawal: 2500,
      singleTradeMax: 500,
    },
  },
  [KycTier.STANDARD]: {
    templateId: TEMPLATE_IDS[KycTier.STANDARD],
    tier: KycTier.STANDARD,
    requiredFields: [
      "email_address",
      "phone_number",
      "name_first",
      "name_last",
      "birthdate",
      "address_street_1",
      "address_city",
      "address_subdivision",
      "address_postal_code",
      "address_country_code",
    ],
    optionalFields: [
      "name_middle",
      "address_street_2",
    ],
    verifications: [
      "email",
      "phone",
      "government_id",
      "database",
    ],
    limits: {
      dailyDeposit: 10000,
      dailyWithdrawal: 5000,
      dailyTrading: 50000,
      monthlyDeposit: 50000,
      monthlyWithdrawal: 25000,
      singleTradeMax: 5000,
    },
  },
  [KycTier.ENHANCED]: {
    templateId: TEMPLATE_IDS[KycTier.ENHANCED],
    tier: KycTier.ENHANCED,
    requiredFields: [
      "email_address",
      "phone_number",
      "name_first",
      "name_last",
      "birthdate",
      "address_street_1",
      "address_city",
      "address_subdivision",
      "address_postal_code",
      "address_country_code",
      "ssn_last4", // For US users
    ],
    optionalFields: [
      "name_middle",
      "address_street_2",
      "occupation",
      "employer_name",
    ],
    verifications: [
      "email",
      "phone",
      "government_id",
      "selfie",
      "database",
    ],
    limits: {
      dailyDeposit: 50000,
      dailyWithdrawal: 25000,
      dailyTrading: 250000,
      monthlyDeposit: 250000,
      monthlyWithdrawal: 100000,
      singleTradeMax: 25000,
    },
  },
  [KycTier.ACCREDITED]: {
    templateId: TEMPLATE_IDS[KycTier.ACCREDITED],
    tier: KycTier.ACCREDITED,
    requiredFields: [
      "email_address",
      "phone_number",
      "name_first",
      "name_last",
      "birthdate",
      "address_street_1",
      "address_city",
      "address_subdivision",
      "address_postal_code",
      "address_country_code",
      "ssn_last4",
      "accreditation_type",
      "net_worth",
      "annual_income",
    ],
    optionalFields: [
      "name_middle",
      "address_street_2",
      "occupation",
      "employer_name",
      "source_of_funds",
    ],
    verifications: [
      "email",
      "phone",
      "government_id",
      "selfie",
      "database",
      "accredited_investor",
    ],
    limits: {
      dailyDeposit: 500000,
      dailyWithdrawal: 250000,
      dailyTrading: 2500000,
      monthlyDeposit: 2500000,
      monthlyWithdrawal: 1000000,
      singleTradeMax: 250000,
    },
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get template configuration by tier
 */
export function getTemplateConfig(tier: KycTier): TemplateRequiredFields {
  return TEMPLATE_CONFIGS[tier];
}

/**
 * Get template ID by tier
 */
export function getTemplateId(tier: KycTier): string {
  return TEMPLATE_IDS[tier];
}

/**
 * Get tier limits
 */
export function getTierLimits(tier: KycTier): TierLimits {
  return TEMPLATE_CONFIGS[tier].limits;
}

/**
 * Get all required fields for a tier (including parent tiers)
 */
export function getAllRequiredFields(tier: KycTier): string[] {
  const fields = new Set<string>();
  const tiers = [KycTier.BASIC, KycTier.STANDARD, KycTier.ENHANCED, KycTier.ACCREDITED];
  const tierIndex = tiers.indexOf(tier);

  for (let i = 0; i <= tierIndex; i++) {
    const config = TEMPLATE_CONFIGS[tiers[i]];
    config.requiredFields.forEach((field) => fields.add(field));
  }

  return Array.from(fields);
}

/**
 * Determine the minimum tier required based on trading amount
 */
export function getRequiredTierForAmount(amount: number, type: "trade" | "deposit" | "withdrawal"): KycTier {
  const tiers = [KycTier.BASIC, KycTier.STANDARD, KycTier.ENHANCED, KycTier.ACCREDITED];

  for (const tier of tiers) {
    const limits = TEMPLATE_CONFIGS[tier].limits;
    const limit =
      type === "trade"
        ? limits.singleTradeMax
        : type === "deposit"
          ? limits.dailyDeposit
          : limits.dailyWithdrawal;

    if (amount <= limit) {
      return tier;
    }
  }

  return KycTier.ACCREDITED;
}

/**
 * Check if a tier upgrade is needed
 */
export function checkTierUpgradeNeeded(
  currentTier: KycTier,
  requestedAmount: number,
  type: "trade" | "deposit" | "withdrawal"
): { needed: boolean; requiredTier: KycTier } {
  const requiredTier = getRequiredTierForAmount(requestedAmount, type);
  const tiers = [KycTier.BASIC, KycTier.STANDARD, KycTier.ENHANCED, KycTier.ACCREDITED];
  const currentIndex = tiers.indexOf(currentTier);
  const requiredIndex = tiers.indexOf(requiredTier);

  return {
    needed: requiredIndex > currentIndex,
    requiredTier,
  };
}

/**
 * Validate that all required fields are present
 */
export function validateFieldsForTier(
  tier: KycTier,
  fields: Record<string, unknown>
): { valid: boolean; missingFields: string[] } {
  const config = TEMPLATE_CONFIGS[tier];
  const missingFields: string[] = [];

  for (const field of config.requiredFields) {
    if (fields[field] === undefined || fields[field] === null || fields[field] === "") {
      missingFields.push(field);
    }
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}
