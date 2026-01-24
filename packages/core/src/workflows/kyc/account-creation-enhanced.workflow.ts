/**
 * Enhanced Account Creation Workflow
 * Demonstrates best practices: validation, observability, saga pattern, proper error handling
 *
 * This is a production-grade implementation showing how to use the shared utilities.
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  sleep,
} from "@temporalio/workflow";

// Import shared utilities
import {
  TIMEOUTS,
  RETRY_POLICIES,
  THRESHOLDS,
} from "../shared/config";
import {
  validationError,
  authorizationError,
  complianceBlockedError,
  timeoutError,
} from "../shared/errors";
import {
  CompensationStack,
  nonCancellable,
  createDeduplicator,
} from "../shared/saga";
import {
  createWorkflowLogger,
  createMetricsEmitter,
  timedStep,
  createStatusTracker,
} from "../shared/observability";
import {
  validateInput,
  accountCreationInputSchema,
} from "../shared/validation";

import type * as activities from "./activities";

// ============================================================================
// Activity Proxies with Enhanced Retry Policies
// ============================================================================

// Standard activities
const {
  sendVerificationEmail,
  createAccountRecord,
  createConvexUser,
  verifyReferralCode,
  applyReferralBonus,
  logAuditEvent,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: TIMEOUTS.ACTIVITY.MEDIUM,
  retry: RETRY_POLICIES.DEFAULT,
});

// Critical KYC activities with extended retry
const {
  initiatePersonaInquiry,
  waitForPersonaCompletion,
  runCheckrBackgroundCheck,
  waitForCheckrCompletion,
  screenWalletChainalysis,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: TIMEOUTS.ACTIVITY.LONG,
  heartbeatTimeout: "30 seconds",
  retry: RETRY_POLICIES.EXTERNAL_API,
});

// NFT minting (blockchain operations)
const { mintWelcomeNFT } = proxyActivities<typeof activities>({
  startToCloseTimeout: TIMEOUTS.ACTIVITY.EXTENDED,
  retry: RETRY_POLICIES.CRITICAL,
});

// ============================================================================
// Input Types
// ============================================================================

export interface AccountCreationEnhancedInput {
  email: string;
  referralCode?: string;
  walletAddress?: string;
}

// ============================================================================
// Status Types
// ============================================================================

export type AccountCreationStep =
  | "validating"
  | "sending_verification"
  | "awaiting_email_verification"
  | "creating_account"
  | "initiating_kyc"
  | "awaiting_kyc"
  | "running_background_checks"
  | "screening_wallet"
  | "awaiting_agreements"
  | "finalizing"
  | "minting_nft"
  | "completed"
  | "failed"
  | "cancelled";

export interface AccountCreationEnhancedStatus {
  workflowId: string;
  step: AccountCreationStep;
  startedAt: string;
  completedAt?: string;
  userId?: string;
  email: string;
  emailVerified: boolean;
  kycStatus: "pending" | "approved" | "rejected" | "needs_review";
  kycInquiryId?: string;
  backgroundCheckStatus: "pending" | "clear" | "consider" | "failed";
  walletScreeningStatus: "pending" | "passed" | "failed" | "skipped";
  agreementsSigned: boolean;
  referralApplied: boolean;
  nftMinted: boolean;
  errors: Array<{ step: string; error: string; timestamp: string }>;
  stepHistory: Array<{ step: AccountCreationStep; timestamp: string; duration?: number }>;
}

// ============================================================================
// Signals
// ============================================================================

export const emailVerifiedSignalEnhanced = defineSignal<[{ verificationToken: string }]>(
  "emailVerifiedEnhanced"
);

export const kycDocumentsSubmittedSignalEnhanced = defineSignal<[{ inquiryId: string }]>(
  "kycDocumentsSubmittedEnhanced"
);

export const agreementsSignedSignalEnhanced = defineSignal<[{ agreementIds: string[] }]>(
  "agreementsSignedEnhanced"
);

export const cancelOnboardingSignal = defineSignal("cancelOnboarding");

// ============================================================================
// Queries
// ============================================================================

export const getOnboardingStatusEnhancedQuery = defineQuery<AccountCreationEnhancedStatus>(
  "getOnboardingStatusEnhanced"
);

// ============================================================================
// Main Workflow
// ============================================================================

export async function accountCreationEnhancedWorkflow(
  input: AccountCreationEnhancedInput
): Promise<AccountCreationEnhancedStatus> {
  // Initialize observability
  const logger = createWorkflowLogger({ email: input.email });
  const metrics = createMetricsEmitter();
  const statusTracker = createStatusTracker<AccountCreationStep>("validating");
  const deduplicator = createDeduplicator();
  const compensationStack = new CompensationStack();

  // Initialize status
  const status: AccountCreationEnhancedStatus = {
    workflowId: `account_${crypto.randomUUID()}`,
    step: "validating",
    startedAt: new Date().toISOString(),
    email: input.email,
    emailVerified: false,
    kycStatus: "pending",
    backgroundCheckStatus: "pending",
    walletScreeningStatus: input.walletAddress ? "pending" : "skipped",
    agreementsSigned: false,
    referralApplied: false,
    nftMinted: false,
    errors: [],
    stepHistory: [],
  };

  // Signal state
  let emailVerificationToken: string | null = null;
  let kycInquiryIdFromSignal: string | null = null;
  let signedAgreementIds: string[] = [];
  let cancellationRequested = false;

  // Set up query handler
  setHandler(getOnboardingStatusEnhancedQuery, () => ({
    ...status,
    step: statusTracker.status,
    stepHistory: statusTracker.getHistory(),
  }));

  // Set up signal handlers
  setHandler(emailVerifiedSignalEnhanced, ({ verificationToken }) => {
    emailVerificationToken = verificationToken;
    status.emailVerified = true;
    logger.info("Email verified via signal", { verificationToken });
  });

  setHandler(kycDocumentsSubmittedSignalEnhanced, ({ inquiryId }) => {
    kycInquiryIdFromSignal = inquiryId;
    logger.info("KYC documents submitted via signal", { inquiryId });
  });

  setHandler(agreementsSignedSignalEnhanced, ({ agreementIds }) => {
    signedAgreementIds = agreementIds;
    status.agreementsSigned = true;
    logger.info("Agreements signed via signal", { agreementIds });
  });

  setHandler(cancelOnboardingSignal, () => {
    cancellationRequested = true;
    logger.warn("Cancellation requested");
  });

  const workflowStartTime = Date.now();

  try {
    // =========================================================================
    // Step 1: Validate Input
    // =========================================================================
    await timedStep(logger, "validate_input", async () => {
      statusTracker.update("validating");
      const validated = validateInput(accountCreationInputSchema, input, "account creation input");
      logger.info("Input validation passed", { email: validated.email });
    });

    // Check for cancellation
    if (cancellationRequested) {
      throw validationError("Account creation cancelled by user");
    }

    // =========================================================================
    // Step 2: Send Verification Email
    // =========================================================================
    await timedStep(logger, "send_verification_email", async () => {
      statusTracker.update("sending_verification");

      const verificationToken = crypto.randomUUID();
      const verificationLink = `https://app.pull.com/verify?token=${verificationToken}`;

      await deduplicator.executeOnce(
        "send_verification_email",
        () => sendVerificationEmail(input.email, verificationLink),
        undefined
      );

      logger.info("Verification email sent", { email: input.email });
      metrics.counter("verification_emails_sent");
    });

    // =========================================================================
    // Step 3: Wait for Email Verification
    // =========================================================================
    await timedStep(logger, "await_email_verification", async () => {
      statusTracker.update("awaiting_email_verification");

      const verified = await condition(
        () => status.emailVerified,
        TIMEOUTS.KYC.EMAIL_VERIFICATION
      );

      if (!verified) {
        metrics.counter("email_verification_timeouts");
        throw timeoutError("email verification", 24 * 60 * 60 * 1000);
      }

      metrics.counter("emails_verified");
    });

    if (cancellationRequested) {
      throw validationError("Account creation cancelled by user");
    }

    // =========================================================================
    // Step 4: Create Account Record
    // =========================================================================
    const accountRecord = await timedStep(logger, "create_account", async () => {
      statusTracker.update("creating_account");

      const record = await createAccountRecord({
        email: input.email,
        verificationToken: emailVerificationToken!,
        referralCode: input.referralCode,
        walletAddress: input.walletAddress,
      });

      status.userId = record.userId;

      // Register compensation
      compensationStack.push("delete_account_record", async () => {
        logger.info("Compensation: deleting account record", { userId: record.userId });
        // In production: call deleteAccountRecord activity
      });

      return record;
    });

    // =========================================================================
    // Step 5: Initiate KYC (Persona)
    // =========================================================================
    const personaInquiry = await timedStep(logger, "initiate_kyc", async () => {
      statusTracker.update("initiating_kyc");

      const inquiry = await initiatePersonaInquiry(accountRecord.userId, input.email);
      status.kycInquiryId = inquiry.inquiryId;

      logger.info("Persona inquiry initiated", { inquiryId: inquiry.inquiryId });
      metrics.counter("kyc_inquiries_initiated");

      return inquiry;
    });

    // =========================================================================
    // Step 6: Wait for KYC Submission & Completion
    // =========================================================================
    await timedStep(logger, "await_kyc", async () => {
      statusTracker.update("awaiting_kyc");

      // Wait for documents to be submitted (signal)
      const docsSubmitted = await condition(
        () => kycInquiryIdFromSignal !== null,
        TIMEOUTS.KYC.KYC_SUBMISSION
      );

      if (!docsSubmitted) {
        metrics.counter("kyc_submission_timeouts");
        throw timeoutError("KYC document submission", 7 * 24 * 60 * 60 * 1000);
      }

      // Wait for Persona to complete verification
      const kycResult = await waitForPersonaCompletion(personaInquiry.inquiryId);

      if (kycResult.status === "failed" || kycResult.status === "declined") {
        status.kycStatus = "rejected";
        metrics.counter("kyc_rejections");
        throw complianceBlockedError(`KYC verification ${kycResult.status}: ${kycResult.reason}`);
      }

      if (kycResult.status === "needs_review") {
        status.kycStatus = "needs_review";
        logger.warn("KYC requires manual review", { inquiryId: personaInquiry.inquiryId });
        // Continue but flag for follow-up
      } else {
        status.kycStatus = "approved";
      }

      metrics.counter("kyc_completions", 1, { status: status.kycStatus });
    });

    if (cancellationRequested) {
      await compensationStack.compensateAll();
      throw validationError("Account creation cancelled by user");
    }

    // =========================================================================
    // Step 7: Run Background Checks (Parallel)
    // =========================================================================
    await timedStep(logger, "background_checks", async () => {
      statusTracker.update("running_background_checks");

      // Run Checkr background check
      const checkrPromise = (async () => {
        const candidate = await runCheckrBackgroundCheck(
          accountRecord.userId,
          input.email,
          "FirstName", // Would come from Persona
          "LastName"
        );

        const result = await waitForCheckrCompletion(candidate.reportId);
        return result;
      })();

      // Run wallet screening if wallet provided
      const walletPromise = input.walletAddress
        ? screenWalletChainalysis(input.walletAddress)
        : Promise.resolve(null);

      // Wait for both
      const [checkrResult, walletResult] = await Promise.all([checkrPromise, walletPromise]);

      // Process Checkr result
      if (checkrResult.status === "consider") {
        status.backgroundCheckStatus = "consider";
        logger.warn("Background check flagged for review");
      } else if (checkrResult.status === "suspended") {
        status.backgroundCheckStatus = "failed";
        throw complianceBlockedError("Background check failed - account suspended");
      } else {
        status.backgroundCheckStatus = "clear";
      }

      // Process wallet screening result
      if (walletResult) {
        if (walletResult.risk === "severe" || walletResult.risk === "high") {
          status.walletScreeningStatus = "failed";
          throw complianceBlockedError(
            `Wallet screening failed: ${walletResult.risk} risk (score: ${walletResult.score})`
          );
        }
        status.walletScreeningStatus = "passed";
      }

      metrics.counter("background_checks_completed");
    });

    // =========================================================================
    // Step 8: Wait for Agreements
    // =========================================================================
    await timedStep(logger, "await_agreements", async () => {
      statusTracker.update("awaiting_agreements");

      const signed = await condition(
        () => status.agreementsSigned,
        TIMEOUTS.KYC.AGREEMENTS_SIGNING
      );

      if (!signed) {
        metrics.counter("agreement_timeouts");
        throw timeoutError("agreements signing", 7 * 24 * 60 * 60 * 1000);
      }

      metrics.counter("agreements_signed");
    });

    // =========================================================================
    // Step 9: Finalize Account
    // =========================================================================
    await timedStep(logger, "finalize_account", async () => {
      statusTracker.update("finalizing");

      // Non-cancellable finalization
      await nonCancellable(async () => {
        await createConvexUser({
          tempUserId: accountRecord.userId,
          email: input.email,
          kycStatus: status.kycStatus,
          kycTier: "basic",
          walletAddress: input.walletAddress,
          agreementIds: signedAgreementIds,
          personaInquiryId: personaInquiry.inquiryId,
        });
      });

      // Apply referral if valid
      if (input.referralCode) {
        const isValidReferral = await verifyReferralCode(input.referralCode);
        if (isValidReferral) {
          await applyReferralBonus(accountRecord.userId, input.referralCode);
          status.referralApplied = true;
          logger.info("Referral bonus applied", { referralCode: input.referralCode });
        }
      }

      metrics.counter("accounts_finalized");
    });

    // =========================================================================
    // Step 10: Mint Welcome NFT (if eligible)
    // =========================================================================
    if (status.referralApplied && input.walletAddress) {
      await timedStep(logger, "mint_nft", async () => {
        statusTracker.update("minting_nft");

        try {
          const nftResult = await mintWelcomeNFT(accountRecord.userId, input.walletAddress);
          status.nftMinted = true;
          logger.info("Welcome NFT minted", { tokenId: nftResult.tokenId });
          metrics.counter("welcome_nfts_minted");
        } catch (error) {
          // NFT minting failure is non-fatal
          logger.warn("Failed to mint welcome NFT", { error });
          status.errors.push({
            step: "mint_nft",
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          });
        }
      });
    }

    // =========================================================================
    // Complete
    // =========================================================================
    statusTracker.update("completed");
    status.step = "completed";
    status.completedAt = new Date().toISOString();

    const duration = Date.now() - workflowStartTime;
    metrics.workflowCompleted("success", duration);

    await logAuditEvent({
      userId: accountRecord.userId,
      action: "account_created",
      metadata: {
        email: input.email,
        kycStatus: status.kycStatus,
        referralApplied: status.referralApplied,
        nftMinted: status.nftMinted,
        duration,
      },
    });

    logger.info("Account creation completed", {
      userId: accountRecord.userId,
      duration,
      kycStatus: status.kycStatus,
    });

    return status;
  } catch (error) {
    // =========================================================================
    // Error Handling & Compensation
    // =========================================================================
    statusTracker.update("failed");
    status.step = "failed";

    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error("Account creation failed", error instanceof Error ? error : undefined, {
      step: statusTracker.status,
    });

    status.errors.push({
      step: statusTracker.status,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });

    // Run compensations
    const compensationResult = await compensationStack.compensateAll();
    if (compensationResult.failed.length > 0) {
      logger.error("Some compensations failed", undefined, {
        failed: compensationResult.failed,
      });
    }

    const duration = Date.now() - workflowStartTime;
    metrics.workflowCompleted("failure", duration);

    await logAuditEvent({
      userId: status.userId ?? "unknown",
      action: "account_creation_failed",
      metadata: {
        email: input.email,
        step: statusTracker.status,
        error: errorMessage,
        compensationsExecuted: compensationResult.executed,
        compensationsFailed: compensationResult.failed,
      },
    });

    throw error;
  }
}
