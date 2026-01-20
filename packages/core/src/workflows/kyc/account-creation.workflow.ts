/**
 * Account Creation Workflow
 * Handles the complete onboarding flow for new users
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

// Activity proxies with retry policies
const {
  sendVerificationEmail,
  createAccountRecord,
  initiatePersonaInquiry,
  runCheckrBackgroundCheck,
  screenWalletChainalysis,
  createConvexUser,
  mintWelcomeNFT,
  sendKYCStatusNotification,
  verifyReferralCode,
  applyReferralBonus,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Extended timeout activities
const {
  waitForPersonaCompletion,
  waitForCheckrCompletion,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  heartbeatTimeout: "30 seconds",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 5,
    maximumInterval: "1 minute",
  },
});

// Workflow input type
export interface AccountCreationInput {
  email: string;
  referralCode?: string;
  walletAddress?: string;
}

// Onboarding status type
export interface OnboardingStatus {
  step:
    | "email_verification"
    | "kyc_submission"
    | "background_check"
    | "wallet_screening"
    | "agreements"
    | "finalizing"
    | "completed"
    | "failed";
  emailVerified: boolean;
  kycSubmitted: boolean;
  kycStatus: "pending" | "approved" | "rejected" | "needs_review";
  backgroundCheckStatus: "pending" | "clear" | "consider" | "failed";
  walletScreeningStatus: "pending" | "passed" | "flagged" | "not_applicable";
  agreementsSigned: boolean;
  referralApplied: boolean;
  welcomeNFTMinted: boolean;
  userId?: string;
  failureReason?: string;
}

// Signals
export const emailVerifiedSignal = defineSignal<[{ token: string }]>("emailVerified");
export const kycDocumentsSubmittedSignal = defineSignal<[{ inquiryId: string }]>("kycDocumentsSubmitted");
export const agreementsSignedSignal = defineSignal<[{ agreementIds: string[] }]>("agreementsSigned");

// Queries
export const getOnboardingStatusQuery = defineQuery<OnboardingStatus>("getOnboardingStatus");

/**
 * Main Account Creation Workflow
 */
export async function accountCreationWorkflow(
  input: AccountCreationInput
): Promise<{ userId: string; status: OnboardingStatus }> {
  const { email, referralCode, walletAddress } = input;

  // Initialize status
  const status: OnboardingStatus = {
    step: "email_verification",
    emailVerified: false,
    kycSubmitted: false,
    kycStatus: "pending",
    backgroundCheckStatus: "pending",
    walletScreeningStatus: walletAddress ? "pending" : "not_applicable",
    agreementsSigned: false,
    referralApplied: false,
    welcomeNFTMinted: false,
  };

  // Set up query handler
  setHandler(getOnboardingStatusQuery, () => status);

  // Track signal data
  let emailVerificationToken: string | undefined;
  let personaInquiryId: string | undefined;
  let signedAgreementIds: string[] = [];

  // Set up signal handlers
  setHandler(emailVerifiedSignal, ({ token }) => {
    emailVerificationToken = token;
  });

  setHandler(kycDocumentsSubmittedSignal, ({ inquiryId }) => {
    personaInquiryId = inquiryId;
    status.kycSubmitted = true;
  });

  setHandler(agreementsSignedSignal, ({ agreementIds }) => {
    signedAgreementIds = agreementIds;
  });

  try {
    // =========================================================================
    // Step 1: Send verification email and wait for verification
    // =========================================================================
    const verificationLink = `https://pull.com/verify?email=${encodeURIComponent(email)}&token=${crypto.randomUUID()}`;
    await sendVerificationEmail(email, verificationLink);

    // Wait for email verification (24hr timeout)
    const emailVerified = await condition(
      () => emailVerificationToken !== undefined,
      "24 hours"
    );

    if (!emailVerified) {
      status.step = "failed";
      status.failureReason = "Email verification timeout (24 hours)";
      throw ApplicationFailure.nonRetryable("Email verification timeout");
    }

    status.emailVerified = true;
    status.step = "kyc_submission";

    // =========================================================================
    // Step 2: Create account record
    // =========================================================================
    const accountRecord = await createAccountRecord({
      email,
      verificationToken: emailVerificationToken!,
      referralCode,
      walletAddress,
    });

    status.userId = accountRecord.userId;

    // =========================================================================
    // Step 3: Initiate Persona inquiry and wait for KYC submission
    // =========================================================================
    const inquiry = await initiatePersonaInquiry(accountRecord.userId, email);

    // Wait for KYC documents submission (7 day timeout)
    const kycSubmitted = await condition(
      () => status.kycSubmitted && personaInquiryId !== undefined,
      "7 days"
    );

    if (!kycSubmitted) {
      status.step = "failed";
      status.failureReason = "KYC submission timeout (7 days)";
      throw ApplicationFailure.nonRetryable("KYC submission timeout");
    }

    // Wait for Persona verification completion
    const personaResult = await waitForPersonaCompletion(inquiry.inquiryId);

    if (personaResult.status === "failed" || personaResult.status === "declined") {
      status.kycStatus = "rejected";
      status.step = "failed";
      status.failureReason = `KYC verification failed: ${personaResult.reason}`;
      await sendKYCStatusNotification(email, "rejected", personaResult.reason);
      throw ApplicationFailure.nonRetryable("KYC verification failed");
    }

    if (personaResult.status === "needs_review") {
      status.kycStatus = "needs_review";
      // Allow workflow to continue but flag for manual review
    } else {
      status.kycStatus = "approved";
    }

    status.step = "background_check";

    // =========================================================================
    // Step 4: Run parallel checks (Checkr + Chainalysis if wallet)
    // =========================================================================
    const checkPromises: Promise<unknown>[] = [];

    // Background check
    const checkrPromise = (async () => {
      const checkrResult = await runCheckrBackgroundCheck(
        accountRecord.userId,
        email,
        personaResult.firstName,
        personaResult.lastName
      );

      const checkrCompletion = await waitForCheckrCompletion(checkrResult.reportId);

      if (checkrCompletion.status === "clear") {
        status.backgroundCheckStatus = "clear";
      } else if (checkrCompletion.status === "consider") {
        status.backgroundCheckStatus = "consider";
      } else {
        status.backgroundCheckStatus = "failed";
        throw ApplicationFailure.nonRetryable("Background check failed");
      }
    })();
    checkPromises.push(checkrPromise);

    // Wallet screening (if wallet provided)
    if (walletAddress) {
      status.step = "wallet_screening";
      const chainalysisPromise = (async () => {
        const screeningResult = await screenWalletChainalysis(walletAddress);

        if (screeningResult.risk === "severe" || screeningResult.risk === "high") {
          status.walletScreeningStatus = "flagged";
          throw ApplicationFailure.nonRetryable(
            `Wallet flagged: ${screeningResult.risk} risk (score: ${screeningResult.score})`
          );
        }

        status.walletScreeningStatus = "passed";
      })();
      checkPromises.push(chainalysisPromise);
    }

    // Wait for all parallel checks
    await Promise.all(checkPromises);

    status.step = "agreements";

    // =========================================================================
    // Step 5: Wait for agreements signature
    // =========================================================================
    const agreementsSigned = await condition(
      () => signedAgreementIds.length > 0,
      "7 days"
    );

    if (!agreementsSigned) {
      status.step = "failed";
      status.failureReason = "Agreements signature timeout (7 days)";
      throw ApplicationFailure.nonRetryable("Agreements signature timeout");
    }

    status.agreementsSigned = true;
    status.step = "finalizing";

    // =========================================================================
    // Step 6: Finalize account in Convex
    // =========================================================================
    await createConvexUser({
      tempUserId: accountRecord.userId,
      email,
      kycStatus: status.kycStatus,
      kycTier: "basic",
      walletAddress,
      agreementIds: signedAgreementIds,
      personaInquiryId: inquiry.inquiryId,
    });

    // =========================================================================
    // Step 7: Process referral and mint NFT if applicable
    // =========================================================================
    if (referralCode) {
      const referralValid = await verifyReferralCode(referralCode);
      if (referralValid) {
        await applyReferralBonus(accountRecord.userId, referralCode);
        status.referralApplied = true;

        // Mint welcome NFT for referred users
        try {
          await mintWelcomeNFT(accountRecord.userId, walletAddress);
          status.welcomeNFTMinted = true;
        } catch (error) {
          // NFT minting is non-critical, log but continue
          console.warn("Failed to mint welcome NFT:", error);
        }
      }
    }

    // =========================================================================
    // Step 8: Send completion notification
    // =========================================================================
    await sendKYCStatusNotification(email, "approved", "Welcome to PULL!");

    status.step = "completed";

    return {
      userId: accountRecord.userId,
      status,
    };
  } catch (error) {
    // Compensation logic for failed workflows
    if (status.userId) {
      try {
        // Mark account as failed in database
        await sendKYCStatusNotification(
          email,
          "failed",
          status.failureReason ?? "Account creation failed"
        );
      } catch (compensationError) {
        console.error("Compensation failed:", compensationError);
      }
    }

    throw error;
  }
}
