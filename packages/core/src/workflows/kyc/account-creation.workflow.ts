/**
 * Account Creation & KYC Workflow
 *
 * Orchestrates the complete user onboarding flow:
 * 1. Email verification
 * 2. Basic account creation
 * 3. Identity verification (Persona)
 * 4. Background check (Checkr)
 * 5. Wallet screening (Chainalysis)
 * 6. Agreement signing
 * 7. Account activation
 *
 * Uses Temporal.io for durable execution with automatic retries
 * and support for long-running operations.
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  sleep,
  ApplicationFailure,
} from "@temporalio/workflow";
import type * as activities from "./activities";

// Proxy activities with retry configuration
const {
  sendVerificationEmail,
  validateVerificationCode,
  createAccountRecord,
  initiatePersonaInquiry,
  checkPersonaInquiryStatus,
  runCheckrBackgroundCheck,
  pollCheckrStatus,
  screenWalletChainalysis,
  validateAgreements,
  activateAccount,
  sendWelcomeEmail,
  creditReferralBonus,
  recordOnboardingEvent,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    maximumAttempts: 3,
    initialInterval: "1 second",
    maximumInterval: "30 seconds",
    backoffCoefficient: 2,
  },
});

// Long-running activities with extended timeout
const { waitForPersonaWebhook, waitForCheckrWebhook } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "24 hours",
  heartbeatTimeout: "30 seconds",
});

// =============================================================================
// SIGNALS - External events that advance the workflow
// =============================================================================

export const emailVerifiedSignal = defineSignal<[{ code: string }]>(
  "emailVerified"
);
export const kycDocumentsSubmittedSignal = defineSignal<[{ inquiryId: string }]>(
  "kycDocumentsSubmitted"
);
export const kycCompletedSignal = defineSignal<
  [{ inquiryId: string; status: string }]
>("kycCompleted");
export const backgroundCheckCompletedSignal = defineSignal<
  [{ reportId: string; status: string }]
>("backgroundCheckCompleted");
export const agreementsSignedSignal = defineSignal<[{ agreements: string[] }]>(
  "agreementsSigned"
);

// =============================================================================
// QUERIES - Real-time status checks
// =============================================================================

export const getOnboardingStatusQuery =
  defineQuery<OnboardingStatus>("getOnboardingStatus");

// =============================================================================
// TYPES
// =============================================================================

export interface OnboardingInput {
  email: string;
  referralCode?: string;
  walletAddress?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface OnboardingStatus {
  step:
    | "email_verification"
    | "kyc_pending"
    | "kyc_in_progress"
    | "kyc_review"
    | "background_check"
    | "wallet_screening"
    | "agreements"
    | "complete"
    | "failed";
  kycTier: "none" | "basic" | "enhanced" | "accredited";
  completedSteps: string[];
  currentStepStartedAt: number;
  blockers: string[];
  accountId?: string;
  personaInquiryId?: string;
  checkrReportId?: string;
  errorMessage?: string;
}

// =============================================================================
// MAIN WORKFLOW
// =============================================================================

export async function AccountCreationWorkflow(
  input: OnboardingInput
): Promise<OnboardingStatus> {
  // Initialize status
  let status: OnboardingStatus = {
    step: "email_verification",
    kycTier: "none",
    completedSteps: [],
    currentStepStartedAt: Date.now(),
    blockers: [],
  };

  // Track signal states
  let emailVerified = false;
  let verificationCode: string | null = null;
  let kycSubmitted = false;
  let kycResult: { status: string; tier?: string } | null = null;
  let backgroundCheckResult: { status: string } | null = null;
  let signedAgreements: string[] = [];

  // ==========================================================================
  // Setup signal handlers
  // ==========================================================================

  setHandler(emailVerifiedSignal, ({ code }) => {
    verificationCode = code;
    emailVerified = true;
  });

  setHandler(kycDocumentsSubmittedSignal, ({ inquiryId }) => {
    if (inquiryId === status.personaInquiryId) {
      kycSubmitted = true;
    }
  });

  setHandler(kycCompletedSignal, ({ inquiryId, status: kycStatus }) => {
    if (inquiryId === status.personaInquiryId) {
      kycResult = { status: kycStatus };
    }
  });

  setHandler(
    backgroundCheckCompletedSignal,
    ({ reportId, status: checkStatus }) => {
      if (reportId === status.checkrReportId) {
        backgroundCheckResult = { status: checkStatus };
      }
    }
  );

  setHandler(agreementsSignedSignal, ({ agreements }) => {
    signedAgreements = agreements;
  });

  // Setup query handler
  setHandler(getOnboardingStatusQuery, () => status);

  // ==========================================================================
  // Step 1: Email Verification
  // ==========================================================================

  await recordOnboardingEvent({
    email: input.email,
    event: "workflow_started",
    step: "email_verification",
  });

  // Send verification email
  await sendVerificationEmail({
    email: input.email,
    ipAddress: input.ipAddress,
  });

  // Wait for email verification (24 hour timeout)
  const emailVerificationDeadline = Date.now() + 24 * 60 * 60 * 1000;
  const verified = await condition(
    () => emailVerified,
    emailVerificationDeadline - Date.now()
  );

  if (!verified) {
    status.step = "failed";
    status.blockers.push("Email verification timed out after 24 hours");
    status.errorMessage = "Email verification timeout";
    await recordOnboardingEvent({
      email: input.email,
      event: "email_verification_timeout",
      step: "email_verification",
    });
    return status;
  }

  // Validate the verification code
  const codeValid = await validateVerificationCode({
    email: input.email,
    code: verificationCode!,
  });

  if (!codeValid) {
    status.step = "failed";
    status.blockers.push("Invalid verification code");
    status.errorMessage = "Invalid verification code";
    return status;
  }

  status.completedSteps.push("email_verification");
  await recordOnboardingEvent({
    email: input.email,
    event: "email_verified",
    step: "email_verification",
  });

  // ==========================================================================
  // Step 2: Create base account
  // ==========================================================================

  const accountResult = await createAccountRecord({
    email: input.email,
    referralCode: input.referralCode,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  status.accountId = accountResult.accountId;
  status.completedSteps.push("account_created");

  // ==========================================================================
  // Step 3: Initiate KYC (Persona)
  // ==========================================================================

  status.step = "kyc_pending";
  status.currentStepStartedAt = Date.now();

  const personaResult = await initiatePersonaInquiry({
    accountId: accountResult.accountId,
    email: input.email,
  });

  status.personaInquiryId = personaResult.inquiryId;

  // Wait for user to submit KYC documents (7 day timeout)
  const kycSubmissionDeadline = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const documentsSubmitted = await condition(
    () => kycSubmitted,
    kycSubmissionDeadline - Date.now()
  );

  if (!documentsSubmitted) {
    // Don't fail, just wait - user can come back
    await recordOnboardingEvent({
      email: input.email,
      event: "kyc_submission_reminder",
      step: "kyc_pending",
      metadata: { daysSinceStart: 7 },
    });
  }

  // Wait for KYC completion (via webhook or polling)
  status.step = "kyc_in_progress";
  status.currentStepStartedAt = Date.now();

  // Poll for KYC completion or wait for webhook signal
  const kycDeadline = Date.now() + 48 * 60 * 60 * 1000; // 48 hours max
  while (!kycResult && Date.now() < kycDeadline) {
    // Check status via polling
    const pollResult = await checkPersonaInquiryStatus({
      inquiryId: personaResult.inquiryId,
    });

    if (pollResult.status === "completed" || pollResult.status === "failed") {
      kycResult = pollResult;
      break;
    }

    // Wait before polling again, but also listen for webhook signal
    await Promise.race([
      condition(() => kycResult !== null, 5 * 60 * 1000), // 5 minutes
      sleep("5 minutes"),
    ]);
  }

  if (!kycResult || kycResult.status !== "completed") {
    status.step = "failed";
    status.blockers.push(
      kycResult?.status === "failed"
        ? "KYC verification failed"
        : "KYC verification timed out"
    );
    status.errorMessage = "KYC verification unsuccessful";
    return status;
  }

  status.kycTier = "basic";
  status.completedSteps.push("kyc_verification");

  // ==========================================================================
  // Step 4: Background Check (Checkr) - Run in parallel with wallet screening
  // ==========================================================================

  status.step = "background_check";
  status.currentStepStartedAt = Date.now();

  const [checkrResult, walletScreenResult] = await Promise.all([
    // Background check
    runCheckrBackgroundCheck({
      accountId: accountResult.accountId,
    }),
    // Wallet screening (if wallet provided)
    input.walletAddress
      ? screenWalletChainalysis({
          accountId: accountResult.accountId,
          walletAddress: input.walletAddress,
        })
      : Promise.resolve({ risk: "low" as const, flags: [] }),
  ]);

  status.checkrReportId = checkrResult.reportId;

  // Wait for background check completion
  if (checkrResult.status === "pending") {
    const bgCheckDeadline = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    while (
      !backgroundCheckResult &&
      Date.now() < bgCheckDeadline &&
      backgroundCheckResult?.status !== "complete"
    ) {
      const pollResult = await pollCheckrStatus({
        reportId: checkrResult.reportId,
      });

      if (
        pollResult.status === "complete" ||
        pollResult.status === "consider" ||
        pollResult.status === "suspended"
      ) {
        backgroundCheckResult = pollResult;
        break;
      }

      await sleep("1 hour");
    }
  }

  // Check for compliance blockers
  const complianceBlockers: string[] = [];

  if (
    backgroundCheckResult?.status === "consider" ||
    backgroundCheckResult?.status === "suspended"
  ) {
    complianceBlockers.push("Background check requires manual review");
    status.step = "kyc_review";
  }

  if (walletScreenResult.risk === "high" || walletScreenResult.risk === "severe") {
    complianceBlockers.push(
      `Wallet screening flagged: ${walletScreenResult.flags.join(", ")}`
    );
    status.step = "kyc_review";
  }

  if (complianceBlockers.length > 0) {
    status.blockers = complianceBlockers;
    await recordOnboardingEvent({
      email: input.email,
      event: "manual_review_required",
      step: "kyc_review",
      metadata: { blockers: complianceBlockers },
    });

    // Wait for manual review resolution (could be days)
    // In production, this would trigger a support ticket and wait for admin signal
    // For now, we'll continue with limited functionality
  }

  status.completedSteps.push("background_check");
  if (input.walletAddress) {
    status.completedSteps.push("wallet_screening");
  }

  // ==========================================================================
  // Step 5: Agreement Signing
  // ==========================================================================

  status.step = "agreements";
  status.currentStepStartedAt = Date.now();

  const requiredAgreements = ["tos", "privacy", "trading_disclosure", "risk_disclosure"];

  // Wait for user to sign all required agreements (30 day timeout)
  const agreementDeadline = Date.now() + 30 * 24 * 60 * 60 * 1000;

  const allSigned = await condition(() => {
    return requiredAgreements.every((a) => signedAgreements.includes(a));
  }, agreementDeadline - Date.now());

  if (!allSigned) {
    status.blockers.push(
      "Required agreements not signed: " +
        requiredAgreements.filter((a) => !signedAgreements.includes(a)).join(", ")
    );
    // Don't fail - user can come back to sign
  }

  // Validate agreements
  await validateAgreements({
    accountId: accountResult.accountId,
    agreements: signedAgreements,
  });

  status.completedSteps.push("agreements_signed");

  // ==========================================================================
  // Step 6: Activate Account
  // ==========================================================================

  await activateAccount({
    accountId: accountResult.accountId,
    kycTier: status.kycTier,
    hasComplianceBlockers: status.blockers.length > 0,
  });

  // Send welcome email
  await sendWelcomeEmail({
    email: input.email,
    accountId: accountResult.accountId,
  });

  // Credit referral bonus if applicable
  if (input.referralCode) {
    await creditReferralBonus({
      accountId: accountResult.accountId,
      referralCode: input.referralCode,
    });
  }

  status.step = "complete";
  status.completedSteps.push("account_activated");

  await recordOnboardingEvent({
    email: input.email,
    event: "onboarding_complete",
    step: "complete",
    metadata: {
      kycTier: status.kycTier,
      hasBlockers: status.blockers.length > 0,
      totalDuration: Date.now() - status.currentStepStartedAt,
    },
  });

  return status;
}

// =============================================================================
// ENHANCED KYC WORKFLOW (for higher limits)
// =============================================================================

export interface EnhancedKYCInput {
  accountId: string;
  userId: string;
  requestedTier: "enhanced" | "accredited";
}

export async function EnhancedKYCWorkflow(
  input: EnhancedKYCInput
): Promise<OnboardingStatus> {
  let status: OnboardingStatus = {
    step: "kyc_pending",
    kycTier: "basic",
    completedSteps: [],
    currentStepStartedAt: Date.now(),
    blockers: [],
    accountId: input.accountId,
  };

  setHandler(getOnboardingStatusQuery, () => status);

  // For enhanced tier: additional document verification
  // For accredited tier: income/asset verification

  if (input.requestedTier === "accredited") {
    // Accredited investor verification
    // This would integrate with a service like Parallel Markets or VerifyInvestor
    status.blockers.push("Accredited investor verification pending");
  }

  // Placeholder for enhanced KYC flow
  status.kycTier = input.requestedTier;
  status.step = "complete";

  return status;
}
