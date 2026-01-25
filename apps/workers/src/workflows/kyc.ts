import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  sleep,
} from "@temporalio/workflow";
import type * as activities from "../activities/kyc";

const {
  createPersonaInquiry,
  checkPersonaStatus,
  resumePersonaInquiry,
  getPersonaVerifications,
  createCheckrCandidate,
  createCheckrReport,
  checkCheckrStatus,
  screenWalletAddress,
  sendVerificationEmail,
  sendKYCApprovedEmail,
  sendKYCRejectedEmail,
  sendKYCReminderEmail,
  updateUserKYCStatus,
  updateKYCInDatabase,
  exchangePlaidToken,
  verifyBankAccount,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 5,
    maximumInterval: "1 minute",
  },
});

// =============================================================================
// Signals
// =============================================================================

/** Signal when email is verified */
export const emailVerifiedSignal = defineSignal("emailVerified");

/** Signal when Persona inquiry completes (from webhook) */
export const personaCompletedSignal = defineSignal<[string, string]>(
  "personaCompleted"
);

/** Signal when Persona inquiry is approved */
export const personaApprovedSignal = defineSignal<[string]>("personaApproved");

/** Signal when Persona inquiry is declined */
export const personaDeclinedSignal = defineSignal<[string, string]>(
  "personaDeclined"
);

/** Signal when Checkr background check completes */
export const checkrCompletedSignal = defineSignal<[string, string]>(
  "checkrCompleted"
);

/** Signal when Plaid bank account is linked */
export const plaidLinkedSignal = defineSignal<[PlaidLinkData]>("plaidLinked");

/** Signal to cancel the KYC workflow */
export const cancelKYCSignal = defineSignal("cancelKYC");

// =============================================================================
// Queries
// =============================================================================

export const getKYCStatusQuery = defineQuery<KYCWorkflowStatus>("getKYCStatus");

// =============================================================================
// Types
// =============================================================================

interface KYCWorkflowParams {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  walletAddress?: string;
  templateId: string;
  targetTier?: "basic" | "standard" | "enhanced" | "accredited";
  requireBankLink?: boolean;
  requireBackgroundCheck?: boolean;
}

interface KYCWorkflowStatus {
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  currentStep: string;
  progress: number;
  personaInquiryId?: string;
  personaSessionToken?: string;
  emailVerified: boolean;
  identityVerified: boolean;
  backgroundCleared: boolean;
  walletScreened: boolean;
  bankLinked: boolean;
  approvedTier?: string;
  rejectionReason?: string;
  steps: KYCStep[];
}

interface KYCStep {
  name: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

interface PlaidLinkData {
  publicToken: string;
  accountId: string;
  institutionId?: string;
  institutionName?: string;
  accountMask?: string;
}

// =============================================================================
// Main KYC Onboarding Workflow
// =============================================================================

/**
 * Complete KYC onboarding workflow using Persona
 * Handles email verification, identity verification, background checks,
 * wallet screening, and optional bank linking.
 */
export async function kycOnboardingWorkflow(
  params: KYCWorkflowParams
): Promise<{ success: boolean; kycTier: string; reason?: string }> {
  const {
    userId,
    email,
    firstName,
    lastName,
    walletAddress,
    templateId,
    targetTier = "basic",
    requireBankLink = false,
    requireBackgroundCheck = false,
  } = params;

  // State tracking
  let emailVerified = false;
  let identityVerified = false;
  let identityApproved = false;
  let backgroundCleared = !requireBackgroundCheck; // Skip if not required
  let walletScreened = !walletAddress; // Skip if no wallet
  let bankLinked = !requireBankLink; // Skip if not required
  let cancelled = false;
  let personaInquiryId = "";
  let personaSessionToken = "";
  let checkrReportId = "";
  let rejectionReason = "";
  let approvedTier = "";
  let plaidData: PlaidLinkData | null = null;

  // Track workflow steps
  const steps: KYCStep[] = [
    { name: "email_verification", status: "pending" },
    { name: "identity_verification", status: "pending" },
    { name: "wallet_screening", status: walletAddress ? "pending" : "skipped" },
    { name: "background_check", status: requireBackgroundCheck ? "pending" : "skipped" },
    { name: "bank_linking", status: requireBankLink ? "pending" : "skipped" },
  ];

  // Calculate progress
  const calculateProgress = (): number => {
    const completed = steps.filter(
      (s) => s.status === "completed" || s.status === "skipped"
    ).length;
    return Math.round((completed / steps.length) * 100);
  };

  const updateStep = (
    name: string,
    status: KYCStep["status"],
    error?: string
  ) => {
    const step = steps.find((s) => s.name === name);
    if (step) {
      step.status = status;
      if (status === "in_progress") step.startedAt = Date.now();
      if (status === "completed" || status === "failed") {
        step.completedAt = Date.now();
      }
      if (error) step.error = error;
    }
  };

  // Set up signal handlers
  setHandler(emailVerifiedSignal, () => {
    emailVerified = true;
  });

  setHandler(personaCompletedSignal, (status: string, _details: string) => {
    identityVerified = status === "completed";
  });

  setHandler(personaApprovedSignal, (tier: string) => {
    identityApproved = true;
    approvedTier = tier;
  });

  setHandler(personaDeclinedSignal, (reason: string, _details: string) => {
    identityVerified = true;
    identityApproved = false;
    rejectionReason = reason;
  });

  setHandler(checkrCompletedSignal, (status: string, _details: string) => {
    backgroundCleared = status === "clear";
    if (status === "consider" || status === "suspended") {
      rejectionReason = `Background check: ${status}`;
    }
  });

  setHandler(plaidLinkedSignal, (data: PlaidLinkData) => {
    plaidData = data;
    bankLinked = true;
  });

  setHandler(cancelKYCSignal, () => {
    cancelled = true;
  });

  // Set up query handler
  setHandler(getKYCStatusQuery, (): KYCWorkflowStatus => {
    return {
      status: cancelled
        ? "cancelled"
        : identityApproved && (backgroundCleared || !requireBackgroundCheck)
          ? "completed"
          : rejectionReason
            ? "failed"
            : "in_progress",
      currentStep:
        steps.find((s) => s.status === "in_progress")?.name ?? "initializing",
      progress: calculateProgress(),
      personaInquiryId,
      personaSessionToken,
      emailVerified,
      identityVerified,
      backgroundCleared,
      walletScreened,
      bankLinked,
      approvedTier,
      rejectionReason,
      steps,
    };
  });

  // ===========================================================================
  // Step 1: Send Email Verification
  // ===========================================================================

  try {
    updateStep("email_verification", "in_progress");
    await updateUserKYCStatus(userId, "pending");

    const verificationToken = crypto.randomUUID();
    const verificationLink = `https://pull.app/verify?token=${verificationToken}&userId=${userId}`;
    await sendVerificationEmail(email, verificationLink);

    // Wait for email verification (max 24 hours)
    const emailVerificationResult = await condition(
      () => emailVerified || cancelled,
      "24 hours"
    );

    if (cancelled) {
      await updateUserKYCStatus(userId, "cancelled");
      return { success: false, kycTier: "none", reason: "Cancelled by user" };
    }

    if (!emailVerificationResult) {
      updateStep("email_verification", "failed", "Timeout");
      await sendKYCReminderEmail(email, "email_verification");
      await updateUserKYCStatus(userId, "rejected");
      return {
        success: false,
        kycTier: "none",
        reason: "Email verification timeout",
      };
    }

    updateStep("email_verification", "completed");
    await updateUserKYCStatus(userId, "email_verified");
  } catch (error) {
    updateStep("email_verification", "failed", String(error));
    return {
      success: false,
      kycTier: "none",
      reason: `Email verification failed: ${error}`,
    };
  }

  // ===========================================================================
  // Step 2: Wallet Screening (parallel with identity if wallet exists)
  // ===========================================================================

  let walletRisk = { risk: "low" as const, score: 0 };

  if (walletAddress) {
    try {
      updateStep("wallet_screening", "in_progress");
      walletRisk = await screenWalletAddress(walletAddress);
      walletScreened = walletRisk.risk !== "severe";

      if (!walletScreened) {
        updateStep("wallet_screening", "failed", "High risk wallet detected");
        await updateUserKYCStatus(userId, "rejected");
        await sendKYCRejectedEmail(
          email,
          "Your wallet address did not pass security screening"
        );
        return {
          success: false,
          kycTier: "none",
          reason: "Wallet screening failed - high risk",
        };
      }

      updateStep("wallet_screening", "completed");
    } catch (error) {
      updateStep("wallet_screening", "failed", String(error));
      // Continue with KYC even if wallet screening fails (non-critical)
      walletScreened = true;
    }
  }

  // ===========================================================================
  // Step 3: Create Persona Identity Verification
  // ===========================================================================

  try {
    updateStep("identity_verification", "in_progress");
    await updateUserKYCStatus(userId, "identity_pending");

    // Create Persona inquiry
    const personaInquiry = await createPersonaInquiry(userId, templateId);
    personaInquiryId = personaInquiry.inquiryId;
    personaSessionToken = personaInquiry.sessionToken ?? "";

    // Update database with Persona inquiry ID
    await updateKYCInDatabase(userId, {
      personaInquiryId,
      status: "in_progress",
      targetTier,
    });

    // Poll for Persona completion or wait for webhook signal
    // Max wait: 7 days with periodic reminders
    for (let daysPassed = 0; daysPassed < 7 && !cancelled; daysPassed++) {
      // Check status every 4 hours within a day (6 times)
      for (let i = 0; i < 6 && !identityVerified && !cancelled; i++) {
        await sleep("4 hours");

        // Check if cancelled
        if (cancelled) break;

        const status = await checkPersonaStatus(personaInquiryId);

        if (status.status === "completed" || status.status === "approved") {
          identityVerified = true;
          identityApproved = status.status === "approved";
          break;
        } else if (status.status === "failed" || status.status === "declined") {
          identityVerified = true;
          identityApproved = false;
          rejectionReason = "Identity verification failed";
          break;
        } else if (status.status === "expired") {
          // Try to resume
          const resumed = await resumePersonaInquiry(personaInquiryId);
          if (resumed.sessionToken) {
            personaSessionToken = resumed.sessionToken;
          }
        }
      }

      // Send reminder email after each day if not completed
      if (!identityVerified && !cancelled && daysPassed < 6) {
        await sendKYCReminderEmail(email, "identity_verification");
      }
    }

    if (cancelled) {
      await updateUserKYCStatus(userId, "cancelled");
      return { success: false, kycTier: "none", reason: "Cancelled by user" };
    }

    if (!identityVerified) {
      updateStep("identity_verification", "failed", "Timeout after 7 days");
      await updateUserKYCStatus(userId, "expired");
      return {
        success: false,
        kycTier: "none",
        reason: "Identity verification expired",
      };
    }

    if (!identityApproved) {
      updateStep("identity_verification", "failed", rejectionReason);
      await updateUserKYCStatus(userId, "rejected");
      await sendKYCRejectedEmail(email, rejectionReason);
      return {
        success: false,
        kycTier: "none",
        reason: rejectionReason,
      };
    }

    updateStep("identity_verification", "completed");
    await updateUserKYCStatus(userId, "identity_verified");
  } catch (error) {
    updateStep("identity_verification", "failed", String(error));
    return {
      success: false,
      kycTier: "none",
      reason: `Identity verification failed: ${error}`,
    };
  }

  // ===========================================================================
  // Step 4: Background Check (if required for enhanced/accredited tiers)
  // ===========================================================================

  if (requireBackgroundCheck && !cancelled) {
    try {
      updateStep("background_check", "in_progress");
      await updateUserKYCStatus(userId, "background_pending");

      // Create Checkr candidate and report
      const checkrCandidate = await createCheckrCandidate(
        userId,
        email,
        firstName,
        lastName
      );
      checkrReportId = await createCheckrReport(checkrCandidate.candidateId);

      // Poll for Checkr completion (max 72 hours with signal support)
      for (let i = 0; i < 72 && !backgroundCleared && !cancelled; i++) {
        await sleep("1 hour");

        if (cancelled) break;

        const status = await checkCheckrStatus(checkrReportId);

        if (status.status === "clear") {
          backgroundCleared = true;
        } else if (
          status.status === "consider" ||
          status.status === "suspended"
        ) {
          rejectionReason = `Background check: ${status.status}`;
          break;
        }
      }

      if (cancelled) {
        await updateUserKYCStatus(userId, "cancelled");
        return { success: false, kycTier: "none", reason: "Cancelled by user" };
      }

      if (!backgroundCleared) {
        updateStep("background_check", "failed", rejectionReason);
        await updateUserKYCStatus(userId, "rejected");
        await sendKYCRejectedEmail(
          email,
          "Background check did not pass verification requirements"
        );
        return {
          success: false,
          kycTier: "none",
          reason: rejectionReason || "Background check failed",
        };
      }

      updateStep("background_check", "completed");
      await updateUserKYCStatus(userId, "background_cleared");
    } catch (error) {
      updateStep("background_check", "failed", String(error));
      return {
        success: false,
        kycTier: "none",
        reason: `Background check failed: ${error}`,
      };
    }
  }

  // ===========================================================================
  // Step 5: Bank Account Linking (if required)
  // ===========================================================================

  if (requireBankLink && !cancelled) {
    try {
      updateStep("bank_linking", "in_progress");

      // Wait for Plaid link signal (max 48 hours)
      const bankLinkResult = await condition(
        () => bankLinked || cancelled,
        "48 hours"
      );

      if (cancelled) {
        await updateUserKYCStatus(userId, "cancelled");
        return { success: false, kycTier: "none", reason: "Cancelled by user" };
      }

      if (!bankLinkResult || !plaidData) {
        updateStep("bank_linking", "failed", "Timeout");
        // Bank linking is optional, continue with lower tier
        bankLinked = false;
      } else {
        // Exchange public token and verify account
        const accessToken = await exchangePlaidToken(plaidData.publicToken);
        const verified = await verifyBankAccount(accessToken, plaidData.accountId);

        if (verified) {
          updateStep("bank_linking", "completed");
          bankLinked = true;
        } else {
          updateStep("bank_linking", "failed", "Verification failed");
          bankLinked = false;
        }
      }
    } catch (error) {
      updateStep("bank_linking", "failed", String(error));
      // Bank linking failure is non-critical for most tiers
      bankLinked = false;
    }
  }

  // ===========================================================================
  // Step 6: Determine Final Tier and Complete
  // ===========================================================================

  // Determine final tier based on verifications completed
  let finalTier = approvedTier || targetTier;

  // Adjust tier based on what was verified
  if (!backgroundCleared && (finalTier === "enhanced" || finalTier === "accredited")) {
    finalTier = "standard";
  }
  if (!bankLinked && finalTier === "accredited") {
    finalTier = "enhanced";
  }

  // Boost tier if wallet has very low risk
  if (walletRisk.score < 0.05 && backgroundCleared && bankLinked) {
    // User is highly verified
    if (finalTier === "enhanced") {
      // Keep as enhanced, could qualify for accredited with additional docs
    }
  }

  // Update final status
  const expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000; // 1 year expiration

  await updateKYCInDatabase(userId, {
    status: "approved",
    currentTier: finalTier,
    personaInquiryId,
    completedAt: Date.now(),
    expiresAt,
    bankLinked,
  });

  await updateUserKYCStatus(userId, "approved", finalTier);
  await sendKYCApprovedEmail(email, finalTier);

  return { success: true, kycTier: finalTier };
}

// =============================================================================
// Tier Upgrade Workflow
// =============================================================================

interface UpgradeKYCParams {
  userId: string;
  email: string;
  currentTier: string;
  targetTier: "standard" | "enhanced" | "accredited";
  requireBankLink?: boolean;
  requireBackgroundCheck?: boolean;
}

/**
 * Workflow for upgrading from one KYC tier to another
 */
export async function upgradeKYCWorkflow(
  params: UpgradeKYCParams
): Promise<{ success: boolean; newTier: string; reason?: string }> {
  const {
    userId,
    email,
    currentTier,
    targetTier,
    requireBankLink = targetTier === "accredited",
    requireBackgroundCheck = targetTier === "enhanced" || targetTier === "accredited",
  } = params;

  // Validate upgrade path
  const tierOrder = ["none", "basic", "standard", "enhanced", "accredited"];
  const currentIndex = tierOrder.indexOf(currentTier);
  const targetIndex = tierOrder.indexOf(targetTier);

  if (targetIndex <= currentIndex) {
    return {
      success: false,
      newTier: currentTier,
      reason: "Cannot downgrade or stay at same tier",
    };
  }

  let cancelled = false;
  let backgroundCleared = !requireBackgroundCheck;
  let bankLinked = !requireBankLink;
  let plaidData: PlaidLinkData | null = null;

  // Set up signal handlers
  setHandler(checkrCompletedSignal, (status: string, _details: string) => {
    backgroundCleared = status === "clear";
  });

  setHandler(plaidLinkedSignal, (data: PlaidLinkData) => {
    plaidData = data;
    bankLinked = true;
  });

  setHandler(cancelKYCSignal, () => {
    cancelled = true;
  });

  // Perform additional verifications based on target tier
  if (requireBackgroundCheck) {
    // Run background check for enhanced/accredited
    try {
      const checkrCandidate = await createCheckrCandidate(
        userId,
        email,
        params.userId, // Using userId as first name placeholder
        ""
      );
      const reportId = await createCheckrReport(checkrCandidate.candidateId);

      // Wait for completion
      for (let i = 0; i < 72 && !backgroundCleared && !cancelled; i++) {
        await sleep("1 hour");
        const status = await checkCheckrStatus(reportId);
        if (status.status === "clear") {
          backgroundCleared = true;
        } else if (status.status === "consider" || status.status === "suspended") {
          return {
            success: false,
            newTier: currentTier,
            reason: `Background check: ${status.status}`,
          };
        }
      }
    } catch (error) {
      return {
        success: false,
        newTier: currentTier,
        reason: `Background check failed: ${error}`,
      };
    }
  }

  if (requireBankLink) {
    // Wait for bank linking
    const bankResult = await condition(() => bankLinked || cancelled, "48 hours");

    if (!bankResult && targetTier === "accredited") {
      return {
        success: false,
        newTier: currentTier,
        reason: "Bank account linking required for accredited tier",
      };
    }
  }

  if (cancelled) {
    return { success: false, newTier: currentTier, reason: "Cancelled by user" };
  }

  // Determine achieved tier
  let achievedTier = targetTier;
  if (!backgroundCleared && targetTier !== "standard") {
    achievedTier = "standard";
  }
  if (!bankLinked && targetTier === "accredited") {
    achievedTier = "enhanced";
  }

  // Update database
  await updateKYCInDatabase(userId, {
    status: "approved",
    currentTier: achievedTier,
    completedAt: Date.now(),
  });

  await updateUserKYCStatus(userId, "approved", achievedTier);

  return { success: true, newTier: achievedTier };
}

// =============================================================================
// KYC Re-verification Workflow
// =============================================================================

interface ReverificationParams {
  userId: string;
  email: string;
  currentTier: string;
  reason: "expired" | "periodic" | "suspicious_activity" | "manual_review";
}

/**
 * Workflow for re-verifying existing users
 */
export async function kycReverificationWorkflow(
  params: ReverificationParams
): Promise<{ success: boolean; maintainedTier: boolean }> {
  const { userId, email, currentTier, reason } = params;

  // Send notification
  await sendKYCReminderEmail(email, `reverification_${reason}`);

  // Create new inquiry for reverification
  const templateId = process.env[`PERSONA_TEMPLATE_${currentTier.toUpperCase()}`] ?? "";
  const inquiry = await createPersonaInquiry(userId, templateId);

  // Wait for completion (30 days for reverification)
  let verified = false;
  for (let day = 0; day < 30; day++) {
    await sleep("24 hours");

    const status = await checkPersonaStatus(inquiry.inquiryId);
    if (status.status === "completed" || status.status === "approved") {
      verified = true;
      break;
    } else if (status.status === "failed" || status.status === "declined") {
      break;
    }

    // Send weekly reminders
    if (day % 7 === 6) {
      await sendKYCReminderEmail(email, "reverification_reminder");
    }
  }

  if (!verified) {
    // Downgrade or suspend account
    await updateKYCInDatabase(userId, {
      status: "expired",
      currentTier: "none",
    });
    await updateUserKYCStatus(userId, "expired");

    return { success: false, maintainedTier: false };
  }

  // Extend expiration
  const newExpiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
  await updateKYCInDatabase(userId, {
    status: "approved",
    expiresAt: newExpiresAt,
  });

  return { success: true, maintainedTier: true };
}

// Export types
export type { KYCWorkflowParams, KYCWorkflowStatus, PlaidLinkData };
