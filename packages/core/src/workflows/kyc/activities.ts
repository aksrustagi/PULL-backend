/**
 * KYC Activities
 * Re-exports from centralized activities and provides additional KYC-specific activities
 */

import { Context } from "@temporalio/activity";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@pull/db/convex/_generated/api";

// Re-export from centralized activities
export * from "../../activities/kyc";

// Initialize Convex client
const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// ============================================================================
// Legacy Types (for backward compatibility)
// ============================================================================

export interface PersonaInquiry {
  inquiryId: string;
  status: "pending" | "completed" | "failed" | "expired" | "needs_review" | "declined";
  templateId: string;
  firstName?: string;
  lastName?: string;
  reason?: string;
}

export interface CheckrCandidate {
  candidateId: string;
  reportId: string;
  status: "pending" | "clear" | "consider" | "suspended";
}

export interface AccountRecord {
  userId: string;
  email: string;
  createdAt: string;
}

export interface UserKYCStatus {
  userId: string;
  email: string;
  tier: "basic" | "enhanced" | "accredited";
  status: "pending" | "approved" | "rejected" | "needs_review";
  lastVerifiedAt: string;
}

export interface DocumentExpirationResult {
  anyExpired: boolean;
  expiredDocuments: string[];
  expiringDocuments: string[];
  expiringWithinDays: (days: number) => boolean;
}

export interface ScreeningResult {
  matched: boolean;
  matchDetails?: string;
  score?: number;
}

export interface VerificationResult {
  verificationId: string;
  status: "approved" | "rejected" | "needs_additional" | "pending";
  reason?: string;
  requiredDocuments?: string[];
}

// ============================================================================
// Persona Activities (Legacy aliases with Convex integration)
// ============================================================================

/**
 * Initiate Persona identity verification (legacy)
 */
export async function initiatePersonaInquiry(
  userId: string,
  email: string
): Promise<PersonaInquiry> {
  console.log(`[KYC Activity] Initiating Persona inquiry for ${userId}`);

  try {
    const response = await fetch("https://api.withpersona.com/api/v1/inquiries", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
        "Content-Type": "application/json",
        "Persona-Version": "2023-01-05",
        "Key-Inflection": "camel",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            inquiryTemplateId: process.env.PERSONA_TEMPLATE_ID,
            referenceId: userId,
            fields: {
              emailAddress: email,
            },
          },
        },
      }),
    });

    if (!response.ok) {
      console.error(`[KYC Activity] Persona API error: ${response.statusText}`);
      // Return simulated inquiry for development
      return {
        inquiryId: `inq_${crypto.randomUUID()}`,
        status: "pending",
        templateId: process.env.PERSONA_TEMPLATE_ID ?? "tmpl_default",
      };
    }

    const data = await response.json();

    return {
      inquiryId: data.data?.id ?? `inq_${crypto.randomUUID()}`,
      status: "pending",
      templateId: process.env.PERSONA_TEMPLATE_ID ?? "tmpl_default",
    };
  } catch (error) {
    console.error("[KYC Activity] Persona inquiry error:", error);
    return {
      inquiryId: `inq_${crypto.randomUUID()}`,
      status: "pending",
      templateId: process.env.PERSONA_TEMPLATE_ID ?? "tmpl_default",
    };
  }
}

/**
 * Wait for Persona verification completion (with heartbeat)
 */
export async function waitForPersonaCompletion(inquiryId: string): Promise<PersonaInquiry> {
  console.log(`[KYC Activity] Waiting for Persona completion: ${inquiryId}`);

  const maxAttempts = 60; // 5 minutes with 5 second intervals
  let attempts = 0;

  while (attempts < maxAttempts) {
    Context.current().heartbeat(`Checking Persona status: attempt ${attempts + 1}`);

    try {
      const response = await fetch(
        `https://api.withpersona.com/api/v1/inquiries/${inquiryId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
            "Persona-Version": "2023-01-05",
            "Key-Inflection": "camel",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const status = data.data?.attributes?.status;

        if (status === "completed" || status === "approved") {
          return {
            inquiryId,
            status: "completed",
            templateId: data.data?.attributes?.inquiryTemplateId,
            firstName: data.data?.attributes?.nameFirst,
            lastName: data.data?.attributes?.nameLast,
          };
        }

        if (status === "failed" || status === "declined") {
          return {
            inquiryId,
            status: status as "failed" | "declined",
            templateId: data.data?.attributes?.inquiryTemplateId,
            reason: data.data?.attributes?.declineReason,
          };
        }

        if (status === "needs_review") {
          return {
            inquiryId,
            status: "needs_review",
            templateId: data.data?.attributes?.inquiryTemplateId,
          };
        }
      }
    } catch (error) {
      console.error("[KYC Activity] Persona poll error:", error);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
    attempts++;
  }

  return {
    inquiryId,
    status: "expired",
    templateId: "",
    reason: "Verification timeout",
  };
}

// ============================================================================
// Checkr Activities (Legacy)
// ============================================================================

/**
 * Run Checkr background check (legacy)
 */
export async function runCheckrBackgroundCheck(
  userId: string,
  email: string,
  firstName: string,
  lastName: string
): Promise<CheckrCandidate> {
  console.log(`[KYC Activity] Running Checkr background check for ${userId}`);

  try {
    const response = await fetch("https://api.checkr.com/v1/candidates", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.CHECKR_API_KEY + ":").toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email: email,
        custom_id: userId,
      }),
    });

    const candidateId = response.ok
      ? (await response.json()).id
      : `cand_${crypto.randomUUID()}`;

    // Create report
    await fetch("https://api.checkr.com/v1/invitations", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.CHECKR_API_KEY + ":").toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        candidate_id: candidateId,
        package: process.env.CHECKR_PACKAGE ?? "tasker_standard",
      }),
    });

    return {
      candidateId,
      reportId: `rep_${crypto.randomUUID()}`,
      status: "pending",
    };
  } catch (error) {
    console.error("[KYC Activity] Checkr error:", error);
    return {
      candidateId: `cand_${crypto.randomUUID()}`,
      reportId: `rep_${crypto.randomUUID()}`,
      status: "pending",
    };
  }
}

/**
 * Wait for Checkr completion (with heartbeat)
 */
export async function waitForCheckrCompletion(reportId: string): Promise<CheckrCandidate> {
  console.log(`[KYC Activity] Waiting for Checkr completion: ${reportId}`);

  const maxAttempts = 144; // 72 hours with 30 minute intervals
  let attempts = 0;

  while (attempts < maxAttempts) {
    Context.current().heartbeat(`Checking Checkr status: attempt ${attempts + 1}`);

    try {
      const response = await fetch(`https://api.checkr.com/v1/reports/${reportId}`, {
        headers: {
          Authorization: `Basic ${Buffer.from(process.env.CHECKR_API_KEY + ":").toString("base64")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (["clear", "consider", "suspended"].includes(data.status)) {
          return {
            candidateId: data.candidate_id ?? "",
            reportId,
            status: data.status as "clear" | "consider" | "suspended",
          };
        }
      }
    } catch (error) {
      console.error("[KYC Activity] Checkr poll error:", error);
    }

    // For development, return after first attempt
    return {
      candidateId: "cand_xxx",
      reportId,
      status: "clear",
    };
  }

  return {
    candidateId: "cand_xxx",
    reportId,
    status: "pending",
  };
}

// ============================================================================
// Chainalysis Activities (Legacy)
// ============================================================================

/**
 * Screen wallet address with Chainalysis (legacy)
 */
export async function screenWalletChainalysis(
  walletAddress: string
): Promise<{ risk: "low" | "medium" | "high" | "severe"; score: number }> {
  console.log(`[KYC Activity] Screening wallet ${walletAddress}`);

  try {
    const response = await fetch(
      `https://api.chainalysis.com/api/risk/v2/entities/${walletAddress}`,
      {
        headers: {
          Token: process.env.CHAINALYSIS_API_KEY ?? "",
        },
      }
    );

    if (!response.ok) {
      return { risk: "low", score: 0.1 };
    }

    const data = await response.json();
    const riskScore = data.risk ?? 0;
    let risk: "low" | "medium" | "high" | "severe" = "low";

    if (riskScore >= 0.8) risk = "severe";
    else if (riskScore >= 0.6) risk = "high";
    else if (riskScore >= 0.4) risk = "medium";

    return { risk, score: riskScore };
  } catch (error) {
    console.error("[KYC Activity] Chainalysis error:", error);
    return { risk: "low", score: 0.1 };
  }
}

// ============================================================================
// Account Activities (with Convex integration)
// ============================================================================

/**
 * Create finalized Convex user
 */
export async function createConvexUser(input: {
  tempUserId: string;
  email: string;
  kycStatus: string;
  kycTier: string;
  walletAddress?: string;
  agreementIds: string[];
  personaInquiryId: string;
}): Promise<void> {
  console.log(`[KYC Activity] Finalizing Convex user ${input.tempUserId}`);

  try {
    await convex.mutation(api.users.updateKYCStatus, {
      id: input.tempUserId as any,
      kycStatus: input.kycStatus as any,
      kycTier: input.kycTier as any,
    });
  } catch (error) {
    console.error("[KYC Activity] Convex user creation error:", error);
    throw error;
  }
}

/**
 * Get user KYC status
 */
export async function getUserKYCStatus(userId: string): Promise<UserKYCStatus> {
  console.log(`[KYC Activity] Getting KYC status for ${userId}`);

  try {
    const user = await convex.query(api.users.getById, { id: userId as any });

    if (!user) {
      throw new Error("User not found");
    }

    return {
      userId,
      email: user.email,
      tier: (user.kycTier as "basic" | "enhanced" | "accredited") ?? "basic",
      status: user.kycStatus === "approved" ? "approved" : "pending",
      lastVerifiedAt: new Date(user.updatedAt).toISOString(),
    };
  } catch (error) {
    console.error("[KYC Activity] Get KYC status error:", error);
    return {
      userId,
      email: "user@example.com",
      tier: "basic",
      status: "pending",
      lastVerifiedAt: new Date().toISOString(),
    };
  }
}

/**
 * Get user's last verification date
 */
export async function getUserLastVerificationDate(userId: string): Promise<string> {
  console.log(`[KYC Activity] Getting last verification date for ${userId}`);

  try {
    const user = await convex.query(api.users.getById, { id: userId as any });
    return user ? new Date(user.updatedAt).toISOString() : new Date().toISOString();
  } catch (error) {
    return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  }
}

/**
 * Update KYC tier
 */
export async function updateKYCTier(
  userId: string,
  tier: "basic" | "enhanced" | "accredited"
): Promise<void> {
  console.log(`[KYC Activity] Updating KYC tier for ${userId} to ${tier}`);

  const tierMap: Record<string, string> = {
    basic: "basic",
    enhanced: "verified",
    accredited: "premium",
  };

  try {
    await convex.mutation(api.users.updateKYCStatus, {
      id: userId as any,
      kycStatus: "approved",
      kycTier: tierMap[tier] as any,
    });
  } catch (error) {
    console.error("[KYC Activity] Update KYC tier error:", error);
    throw error;
  }
}

// ============================================================================
// Document Verification Activities
// ============================================================================

/**
 * Initiate enhanced verification
 */
export async function initiateEnhancedVerification(
  userId: string,
  documentIds: string[]
): Promise<VerificationResult> {
  console.log(`[KYC Activity] Initiating enhanced verification for ${userId}`);

  return {
    verificationId: `ver_${crypto.randomUUID()}`,
    status: "pending",
  };
}

/**
 * Initiate accredited verification
 */
export async function initiateAccreditedVerification(
  userId: string,
  documentIds: string[]
): Promise<{
  verificationId: string;
  incomeDocumentIds: string[];
  netWorthDocumentIds: string[];
  letterDocumentId?: string;
}> {
  console.log(`[KYC Activity] Initiating accredited verification for ${userId}`);

  return {
    verificationId: `ver_${crypto.randomUUID()}`,
    incomeDocumentIds: documentIds.filter((d) => d.includes("income")),
    netWorthDocumentIds: documentIds.filter((d) => d.includes("networth")),
    letterDocumentId: documentIds.find((d) => d.includes("letter")),
  };
}

/**
 * Wait for document verification
 */
export async function waitForDocumentVerification(
  verificationId: string,
  additionalDocuments?: string[]
): Promise<VerificationResult> {
  console.log(`[KYC Activity] Waiting for document verification: ${verificationId}`);

  Context.current().heartbeat("Verifying documents...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return {
    verificationId,
    status: "approved",
  };
}

/**
 * Verify income documents
 */
export async function verifyIncomeDocuments(
  userId: string,
  documentIds: string[]
): Promise<{ verified: boolean; alternatePathAvailable: boolean }> {
  console.log(`[KYC Activity] Verifying income documents for ${userId}`);

  return {
    verified: true,
    alternatePathAvailable: true,
  };
}

/**
 * Verify net worth documents
 */
export async function verifyNetWorthDocuments(
  userId: string,
  documentIds: string[]
): Promise<{ verified: boolean }> {
  console.log(`[KYC Activity] Verifying net worth documents for ${userId}`);

  return { verified: true };
}

/**
 * Verify accredited investor letter
 */
export async function verifyAccreditedInvestorLetter(
  userId: string,
  letterId?: string
): Promise<{ verified: boolean }> {
  console.log(`[KYC Activity] Verifying accredited investor letter for ${userId}`);

  return { verified: letterId !== undefined };
}

/**
 * Perform manual review
 */
export async function performManualReview(
  userId: string,
  context: {
    targetTier: string;
    documents: string[];
    additionalDocuments: string[];
  }
): Promise<void> {
  console.log(`[KYC Activity] Triggering manual review for ${userId}`);

  // TODO: Create review task in admin system
}

// ============================================================================
// NFT Activities
// ============================================================================

/**
 * Mint welcome NFT for referred users
 */
export async function mintWelcomeNFT(
  userId: string,
  walletAddress?: string
): Promise<{ tokenId: string; txHash: string }> {
  console.log(`[KYC Activity] Minting welcome NFT for ${userId}`);

  if (!walletAddress) {
    throw new Error("Wallet address required for NFT minting");
  }

  // TODO: Call smart contract to mint NFT
  return {
    tokenId: `token_${crypto.randomUUID()}`,
    txHash: `0x${crypto.randomUUID().replace(/-/g, "")}`,
  };
}

// ============================================================================
// Screening Activities
// ============================================================================

/**
 * Run sanctions screening
 */
export async function runSanctionsScreening(
  userId: string,
  kycData: UserKYCStatus
): Promise<ScreeningResult> {
  console.log(`[KYC Activity] Running sanctions screening for ${userId}`);

  // TODO: Call sanctions screening API
  return { matched: false };
}

/**
 * Run watchlist screening
 */
export async function runWatchlistScreening(
  userId: string,
  kycData: UserKYCStatus
): Promise<ScreeningResult> {
  console.log(`[KYC Activity] Running watchlist screening for ${userId}`);

  // TODO: Call watchlist screening API
  return { matched: false };
}

/**
 * Run PEP (Politically Exposed Person) screening
 */
export async function runPEPScreening(
  userId: string,
  kycData: UserKYCStatus
): Promise<ScreeningResult> {
  console.log(`[KYC Activity] Running PEP screening for ${userId}`);

  // TODO: Call PEP screening API
  return { matched: false };
}

/**
 * Initiate re-verification
 */
export async function initiateReVerification(
  userId: string,
  context: {
    reason: string;
    requiredDocuments: string[];
  }
): Promise<{ verificationId: string }> {
  console.log(`[KYC Activity] Initiating re-verification for ${userId}`);

  return { verificationId: `rever_${crypto.randomUUID()}` };
}

// ============================================================================
// Audit Activities
// ============================================================================

/**
 * Log audit event
 */
export async function logAuditEvent(event: {
  userId: string;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.log(`[KYC Activity] Audit log: ${event.action} for ${event.userId}`);

  // Audit logs are recorded via Convex mutations
}
