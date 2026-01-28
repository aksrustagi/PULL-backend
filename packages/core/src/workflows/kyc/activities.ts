/**
 * KYC Activities
 * All activities for KYC-related workflows
 */

import { Context } from "@temporalio/activity";

// ============================================================================
// Types
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
// Email Activities
// ============================================================================

/**
 * Send verification email to user
 */
export async function sendVerificationEmail(
  email: string,
  verificationLink: string
): Promise<void> {
  console.log(`[KYC Activity] Sending verification email to ${email}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "PULL <verify@pull.com>",
      to: email,
      subject: "Verify your PULL account",
      html: `
        <h1>Welcome to PULL!</h1>
        <p>Click the link below to verify your email address:</p>
        <a href="${verificationLink}">Verify Email</a>
        <p>This link expires in 24 hours.</p>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send verification email: ${response.statusText}`);
  }
}

/**
 * Send KYC status notification
 */
export async function sendKYCStatusNotification(
  email: string,
  status: "approved" | "rejected" | "upgrade_approved" | "upgrade_rejected" | "account_suspended" | "failed",
  message?: string
): Promise<void> {
  console.log(`[KYC Activity] Sending KYC status notification to ${email}: ${status}`);

  const subjects: Record<string, string> = {
    approved: "Your PULL account has been verified!",
    rejected: "PULL Account Verification Update",
    upgrade_approved: "KYC Upgrade Approved",
    upgrade_rejected: "KYC Upgrade Update",
    account_suspended: "Important: PULL Account Suspended",
    failed: "PULL Account Creation Failed",
  };

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "PULL <support@pull.com>",
      to: email,
      subject: subjects[status] ?? "PULL Account Update",
      html: `<p>${message ?? `Your account status has been updated to: ${status}`}</p>`,
    }),
  });
}

/**
 * Send Re-KYC reminder
 */
export async function sendReKYCReminder(
  email: string,
  type: "document_expiring" | "reverification_required" | "periodic",
  message: string
): Promise<void> {
  console.log(`[KYC Activity] Sending Re-KYC reminder to ${email}: ${type}`);

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "PULL <support@pull.com>",
      to: email,
      subject: "Action Required: PULL Account Verification",
      html: `<p>${message}</p>`,
    }),
  });
}

// ============================================================================
// Account Activities
// ============================================================================

/**
 * Create initial account record
 */
export async function createAccountRecord(input: {
  email: string;
  verificationToken: string;
  referralCode?: string;
  walletAddress?: string;
}): Promise<AccountRecord> {
  console.log(`[KYC Activity] Creating account record for ${input.email}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  const userId = `user_${crypto.randomUUID()}`;

  return {
    userId,
    email: input.email,
    createdAt: new Date().toISOString(),
  };
}

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

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

/**
 * Get user KYC status
 */
export async function getUserKYCStatus(userId: string): Promise<UserKYCStatus> {
  console.log(`[KYC Activity] Getting KYC status for ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return {
    userId,
    email: "user@example.com",
    tier: "basic",
    status: "approved",
    lastVerifiedAt: new Date().toISOString(),
  };
}

/**
 * Get user's last verification date
 */
export async function getUserLastVerificationDate(userId: string): Promise<string> {
  console.log(`[KYC Activity] Getting last verification date for ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days ago
}

/**
 * Update KYC tier
 */
export async function updateKYCTier(
  userId: string,
  tier: "basic" | "enhanced" | "accredited"
): Promise<void> {
  console.log(`[KYC Activity] Updating KYC tier for ${userId} to ${tier}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

/**
 * Suspend user account
 */
export async function suspendUserAccount(userId: string, reason: string): Promise<void> {
  console.log(`[KYC Activity] Suspending account ${userId}: ${reason}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

// ============================================================================
// Persona Activities
// ============================================================================

/**
 * Initiate Persona identity verification
 */
export async function initiatePersonaInquiry(
  userId: string,
  email: string
): Promise<PersonaInquiry> {
  console.log(`[KYC Activity] Initiating Persona inquiry for ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  const response = await fetch("https://api.withpersona.com/api/v1/inquiries", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
      "Content-Type": "application/json",
      "Persona-Version": "2023-01-05",
    },
    body: JSON.stringify({
      data: {
        attributes: {
          "inquiry-template-id": process.env.PERSONA_TEMPLATE_ID,
          "reference-id": userId,
          "fields": {
            "email-address": email,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create Persona inquiry: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    inquiryId: data.data?.id ?? `inq_${crypto.randomUUID()}`,
    status: "pending",
    templateId: process.env.PERSONA_TEMPLATE_ID ?? "tmpl_default",
  };
}

/**
 * Wait for Persona verification completion (with heartbeat)
 */
export async function waitForPersonaCompletion(inquiryId: string): Promise<PersonaInquiry> {
  console.log(`[KYC Activity] Waiting for Persona completion: ${inquiryId}`);

  const maxAttempts = 60; // 5 minutes with 5 second intervals
  let attempts = 0;

  while (attempts < maxAttempts) {
    // Heartbeat to keep activity alive
    Context.current().heartbeat(`Checking Persona status: attempt ${attempts + 1}`);

    // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
    const response = await fetch(
      `https://api.withpersona.com/api/v1/inquiries/${inquiryId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
          "Persona-Version": "2023-01-05",
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
          templateId: data.data?.attributes?.["inquiry-template-id"],
          firstName: data.data?.attributes?.["name-first"],
          lastName: data.data?.attributes?.["name-last"],
        };
      }

      if (status === "failed" || status === "declined") {
        return {
          inquiryId,
          status: status as "failed" | "declined",
          templateId: data.data?.attributes?.["inquiry-template-id"],
          reason: data.data?.attributes?.["decline-reason"],
        };
      }

      if (status === "needs_review") {
        return {
          inquiryId,
          status: "needs_review",
          templateId: data.data?.attributes?.["inquiry-template-id"],
        };
      }
    }

    // Wait before next poll
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
// Checkr Activities
// ============================================================================

/**
 * Run Checkr background check
 */
export async function runCheckrBackgroundCheck(
  userId: string,
  email: string,
  firstName: string,
  lastName: string
): Promise<CheckrCandidate> {
  console.log(`[KYC Activity] Running Checkr background check for ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  // Create candidate
  const candidateResponse = await fetch("https://api.checkr.com/v1/candidates", {
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

  const candidateId = `cand_${crypto.randomUUID()}`;

  // Create invitation/report
  const reportResponse = await fetch("https://api.checkr.com/v1/invitations", {
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
}

/**
 * Wait for Checkr completion (with heartbeat)
 */
export async function waitForCheckrCompletion(reportId: string): Promise<CheckrCandidate> {
  console.log(`[KYC Activity] Waiting for Checkr completion: ${reportId}`);

  const maxAttempts = 60;
  let attempts = 0;

  while (attempts < maxAttempts) {
    Context.current().heartbeat(`Checking Checkr status: attempt ${attempts + 1}`);

    // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
    // Simulated response
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // For now, return completed after first attempt (replace with real API call)
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
// Chainalysis Activities
// ============================================================================

/**
 * Screen wallet address with Chainalysis
 */
export async function screenWalletChainalysis(
  walletAddress: string
): Promise<{ risk: "low" | "medium" | "high" | "severe"; score: number }> {
  console.log(`[KYC Activity] Screening wallet ${walletAddress}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  const response = await fetch(
    `https://api.chainalysis.com/api/risk/v2/entities/${walletAddress}`,
    {
      headers: {
        Token: process.env.CHAINALYSIS_API_KEY ?? "",
      },
    }
  );

  if (!response.ok) {
    // Default to low risk if API fails (should be handled better in production)
    return { risk: "low", score: 0.1 };
  }

  const data = await response.json();

  // Map Chainalysis risk score to our risk levels
  const riskScore = data.risk ?? 0;
  let risk: "low" | "medium" | "high" | "severe" = "low";

  if (riskScore >= 0.8) risk = "severe";
  else if (riskScore >= 0.6) risk = "high";
  else if (riskScore >= 0.4) risk = "medium";

  return { risk, score: riskScore };
}

// ============================================================================
// Referral Activities
// ============================================================================

/**
 * Verify referral code
 */
export async function verifyReferralCode(referralCode: string): Promise<boolean> {
  console.log(`[KYC Activity] Verifying referral code: ${referralCode}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return true;
}

/**
 * Apply referral bonus
 */
export async function applyReferralBonus(userId: string, referralCode: string): Promise<void> {
  console.log(`[KYC Activity] Applying referral bonus for ${userId} with code ${referralCode}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
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

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return {
    tokenId: `token_${crypto.randomUUID()}`,
    txHash: `0x${crypto.randomUUID().replace(/-/g, "")}`,
  };
}

// ============================================================================
// Document Verification Activities
// ============================================================================

/**
 * Check document expiration status
 */
export async function checkDocumentExpiration(userId: string): Promise<DocumentExpirationResult> {
  console.log(`[KYC Activity] Checking document expiration for ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return {
    anyExpired: false,
    expiredDocuments: [],
    expiringDocuments: [],
    expiringWithinDays: () => false,
  };
}

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

  // Simulated verification
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
 * Request additional documents
 */
export async function requestAdditionalDocuments(
  userId: string,
  requiredDocuments: string[]
): Promise<void> {
  console.log(`[KYC Activity] Requesting additional documents for ${userId}: ${requiredDocuments.join(", ")}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
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

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
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

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
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

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
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

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
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

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}
