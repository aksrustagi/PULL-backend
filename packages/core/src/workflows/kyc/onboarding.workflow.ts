/**
 * KYC Onboarding Workflow
 * Complete KYC verification flow using Sumsub, Checkr, Parallel Markets, and Sanctions.io
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  sleep,
  ApplicationFailure,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "./activities";
import type {
  KYCWorkflowInput,
  KYCWorkflowOutput,
  KYCWorkflowStatus,
  KYCStep,
  SumsubCompletedSignal,
  CheckrCompletedSignal,
  AccreditationCompletedSignal,
  PlaidLinkedSignal,
  SanctionsCompletedSignal,
  SumsubResult,
  CheckrResult,
  AccreditationResult,
  SanctionsResult,
  PlaidResult,
} from "./types";
import { TIER_CONFIG, KYC_EXPIRATION } from "./types";

// ==========================================================================
// ACTIVITY PROXIES
// ==========================================================================

// Standard timeout activities (30 seconds)
const {
  createSumsubApplicant,
  generateSumsubToken,
  getSumsubStatus,
  resetSumsubApplicant,
  createPlaidLinkToken,
  exchangePlaidToken,
  getPlaidAuth,
  createCheckrCandidateAndReport,
  getCheckrReportStatus,
  createAccreditationRequest,
  getAccreditationStatus,
  screenUserSanctions,
  screenWalletSanctions,
  addToOngoingMonitoring,
  updateKYCStatusInDB,
  createKYCRecord,
  sendKYCUserNotification,
  logAuditEvent,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Extended timeout activities (5 minutes) - for waiting on external services
const extendedActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  heartbeatTimeout: "30 seconds",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 5,
    maximumInterval: "1 minute",
  },
});

// ==========================================================================
// SIGNALS
// ==========================================================================

export const sumsubCompletedSignal = defineSignal<[SumsubCompletedSignal]>("sumsubCompleted");
export const checkrCompletedSignal = defineSignal<[CheckrCompletedSignal]>("checkrCompleted");
export const accreditationCompletedSignal = defineSignal<[AccreditationCompletedSignal]>("accreditationCompleted");
export const plaidLinkedSignal = defineSignal<[PlaidLinkedSignal]>("plaidLinked");
export const sanctionsCompletedSignal = defineSignal<[SanctionsCompletedSignal]>("sanctionsCompleted");
export const cancelKYCSignal = defineSignal<[]>("cancelKYC");

// ==========================================================================
// QUERIES
// ==========================================================================

export const getKYCStatusQuery = defineQuery<KYCWorkflowStatus>("getKYCStatus");

// ==========================================================================
// MAIN WORKFLOW
// ==========================================================================

/**
 * KYC Onboarding Workflow
 *
 * Handles complete KYC verification flow:
 * 1. Initialize - Create Sumsub applicant, return SDK token
 * 2. Parallel Quick Checks - Sanctions screening, wallet screening (if applicable)
 * 3. Wait for Sumsub - User completes identity verification
 * 4. Conditional: Enhanced Tier - Background check via Checkr
 * 5. Conditional: Accredited Tier - Parallel Markets accreditation
 * 6. Conditional: Bank Linking - Plaid account linking
 * 7. Finalize - Update status, send notifications
 */
export async function onboardingKYCWorkflow(
  input: KYCWorkflowInput
): Promise<KYCWorkflowOutput> {
  const { userId, email, targetTier, userData, requireBankLink, walletAddress, walletChain } = input;
  const workflowId = workflowInfo().workflowId;
  const tierConfig = TIER_CONFIG[targetTier];

  // Initialize workflow status
  const status: KYCWorkflowStatus = {
    workflowId,
    userId,
    targetTier,
    status: "pending",
    currentStep: "initialize",
    progress: 0,
    steps: [
      { name: "initialize", status: "pending" },
      { name: "sanctions_screening", status: "pending" },
      { name: "sumsub_verification", status: "pending" },
      ...(tierConfig.requiresCheckr ? [{ name: "background_check", status: "pending" as const }] : []),
      ...(tierConfig.requiresAccreditation ? [{ name: "accreditation", status: "pending" as const }] : []),
      ...(requireBankLink ? [{ name: "bank_linking", status: "pending" as const }] : []),
      { name: "finalize", status: "pending" },
    ],
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Calculate total steps for progress
  const totalSteps = status.steps.length;
  let completedSteps = 0;

  function updateProgress() {
    status.progress = Math.round((completedSteps / totalSteps) * 100);
    status.updatedAt = Date.now();
  }

  function updateStep(name: string, stepStatus: KYCStep["status"], metadata?: Record<string, unknown>) {
    const step = status.steps.find((s) => s.name === name);
    if (step) {
      step.status = stepStatus;
      if (stepStatus === "in_progress") {
        step.startedAt = Date.now();
        status.currentStep = name;
      } else if (stepStatus === "completed") {
        step.completedAt = Date.now();
        completedSteps++;
        updateProgress();
      } else if (stepStatus === "failed" && metadata?.error) {
        step.error = String(metadata.error);
      }
      if (metadata) {
        step.metadata = { ...step.metadata, ...metadata };
      }
    }
    status.updatedAt = Date.now();
  }

  // Signal data storage
  let sumsubSignalData: SumsubCompletedSignal | undefined;
  let checkrSignalData: CheckrCompletedSignal | undefined;
  let accreditationSignalData: AccreditationCompletedSignal | undefined;
  let plaidSignalData: PlaidLinkedSignal | undefined;
  let sanctionsSignalData: SanctionsCompletedSignal | undefined;
  let cancelled = false;

  // Set up query handler
  setHandler(getKYCStatusQuery, () => status);

  // Set up signal handlers
  setHandler(sumsubCompletedSignal, (signal) => {
    sumsubSignalData = signal;
  });

  setHandler(checkrCompletedSignal, (signal) => {
    checkrSignalData = signal;
  });

  setHandler(accreditationCompletedSignal, (signal) => {
    accreditationSignalData = signal;
  });

  setHandler(plaidLinkedSignal, (signal) => {
    plaidSignalData = signal;
  });

  setHandler(sanctionsCompletedSignal, (signal) => {
    sanctionsSignalData = signal;
  });

  setHandler(cancelKYCSignal, () => {
    cancelled = true;
  });

  try {
    // =========================================================================
    // Step 1: Initialize
    // =========================================================================
    updateStep("initialize", "in_progress");
    status.status = "in_progress";

    // Create KYC record in database
    const kycRecord = await createKYCRecord(userId, targetTier, workflowId);

    // Create Sumsub applicant
    const { applicantId } = await createSumsubApplicant(
      userId,
      email,
      targetTier,
      userData
    );
    status.sumsubApplicantId = applicantId;

    // Generate SDK access token
    const { accessToken, expiresAt } = await generateSumsubToken(applicantId, targetTier);
    status.sumsubAccessToken = accessToken;

    // Log audit event
    await logAuditEvent({
      userId,
      action: "kyc.started",
      metadata: {
        targetTier,
        applicantId,
        workflowId,
      },
    });

    // Send notification
    await sendKYCUserNotification(userId, email, "started", { tier: targetTier });

    // Update database
    await updateKYCStatusInDB(userId, {
      status: "in_progress",
      sumsubApplicantId: applicantId,
      workflowId,
    });

    updateStep("initialize", "completed");

    // =========================================================================
    // Step 2: Parallel Quick Checks (Sanctions + Wallet Screening)
    // =========================================================================
    updateStep("sanctions_screening", "in_progress");

    // Build name for screening
    const screeningName = userData
      ? `${userData.firstName} ${userData.lastName}`
      : email.split("@")[0];

    // Run sanctions screening
    const sanctionsResult = await screenUserSanctions(
      userId,
      screeningName,
      userData?.dob,
      userData?.address?.country,
      userData?.nationality
    );

    status.sanctionsScreeningId = sanctionsResult.screeningId;
    status.sanctionsResult = sanctionsResult;

    // Check for critical sanctions matches
    if (sanctionsResult.match && sanctionsResult.riskLevel === "critical") {
      status.status = "rejected";
      await updateKYCStatusInDB(userId, {
        status: "rejected",
        sanctionsScreeningId: sanctionsResult.screeningId,
        sanctionsResult,
        rejectionReason: "Sanctions screening match",
      });
      throw ApplicationFailure.nonRetryable("Sanctions screening: Critical match found");
    }

    // Wallet screening (if provided)
    if (walletAddress && walletChain) {
      const walletResult = await screenWalletSanctions(walletAddress, walletChain);
      if (walletResult.match && walletResult.riskScore > 75) {
        status.status = "rejected";
        await updateKYCStatusInDB(userId, {
          status: "rejected",
          rejectionReason: "Wallet screening: High risk score",
        });
        throw ApplicationFailure.nonRetryable("Wallet screening: High risk detected");
      }
    }

    // Add to ongoing monitoring
    await addToOngoingMonitoring(userId, {
      name: screeningName,
      dob: userData?.dob,
      country: userData?.address?.country,
    });

    updateStep("sanctions_screening", "completed");

    // =========================================================================
    // Step 3: Wait for Sumsub Verification (24hr timeout)
    // =========================================================================
    updateStep("sumsub_verification", "in_progress");
    status.status = "awaiting_user_action";

    // Wait for Sumsub completion signal (webhook-triggered)
    const sumsubCompleted = await condition(
      () => sumsubSignalData !== undefined || cancelled,
      "24 hours"
    );

    if (cancelled) {
      status.status = "rejected";
      await updateKYCStatusInDB(userId, {
        status: "rejected",
        rejectionReason: "User cancelled",
      });
      throw ApplicationFailure.nonRetryable("KYC cancelled by user");
    }

    if (!sumsubCompleted || !sumsubSignalData) {
      status.status = "expired";
      await updateKYCStatusInDB(userId, {
        status: "expired",
        rejectionReason: "Verification timeout",
      });
      throw ApplicationFailure.nonRetryable("Sumsub verification timeout (24 hours)");
    }

    // Process Sumsub result
    const sumsubResult: SumsubResult = {
      applicantId: sumsubSignalData.applicantId,
      reviewStatus: sumsubSignalData.reviewStatus,
      reviewAnswer: sumsubSignalData.reviewAnswer,
      rejectLabels: sumsubSignalData.rejectLabels,
      moderationComment: sumsubSignalData.moderationComment,
      completedAt: Date.now(),
    };
    status.sumsubResult = sumsubResult;

    if (sumsubSignalData.reviewAnswer === "RED") {
      status.status = "rejected";
      const rejectionReason = sumsubSignalData.rejectLabels?.join(", ") || "Identity verification failed";
      await updateKYCStatusInDB(userId, {
        status: "rejected",
        sumsubResult,
        rejectionReason,
      });
      await sendKYCUserNotification(userId, email, "rejected", {
        reason: rejectionReason,
      });
      throw ApplicationFailure.nonRetryable(`Sumsub verification rejected: ${rejectionReason}`);
    }

    if (sumsubSignalData.reviewAnswer === "ERROR") {
      // Retry-able error, throw retryable failure
      throw ApplicationFailure.retryable("Sumsub verification error");
    }

    // GREEN - verification passed
    status.status = "in_progress";
    await updateKYCStatusInDB(userId, {
      status: "in_progress",
      sumsubResult,
    });

    updateStep("sumsub_verification", "completed");

    // =========================================================================
    // Step 4: Conditional - Background Check (Enhanced/Accredited tiers)
    // =========================================================================
    if (tierConfig.requiresCheckr && userData) {
      updateStep("background_check", "in_progress");

      // Create Checkr candidate and report
      const { candidateId, reportId } = await createCheckrCandidateAndReport(
        userId,
        email,
        userData,
        (tierConfig.checkrPackage as any) ?? "tasker_standard"
      );

      status.checkrCandidateId = candidateId;
      status.checkrReportId = reportId;

      await updateKYCStatusInDB(userId, {
        checkrCandidateId: candidateId,
        checkrReportId: reportId,
      });

      // Wait for Checkr completion signal (7 day timeout)
      const checkrCompleted = await condition(
        () => checkrSignalData !== undefined || cancelled,
        "7 days"
      );

      if (cancelled) {
        status.status = "rejected";
        throw ApplicationFailure.nonRetryable("KYC cancelled by user");
      }

      if (!checkrCompleted || !checkrSignalData) {
        status.status = "expired";
        await updateKYCStatusInDB(userId, {
          status: "expired",
          rejectionReason: "Background check timeout",
        });
        throw ApplicationFailure.nonRetryable("Checkr background check timeout (7 days)");
      }

      // Process Checkr result
      const checkrResult: CheckrResult = {
        candidateId,
        reportId: checkrSignalData.reportId,
        status: checkrSignalData.status,
        result: checkrSignalData.result,
        completedAt: Date.now(),
      };
      status.checkrResult = checkrResult;

      if (checkrSignalData.result === "adverse_action") {
        status.status = "rejected";
        await updateKYCStatusInDB(userId, {
          status: "rejected",
          checkrResult,
          rejectionReason: "Background check: Adverse action required",
        });
        await sendKYCUserNotification(userId, email, "rejected", {
          reason: "Background check did not pass",
        });
        throw ApplicationFailure.nonRetryable("Background check failed: Adverse action");
      }

      // 'consider' results may need manual review
      if (checkrSignalData.result === "consider") {
        status.status = "under_review";
        await updateKYCStatusInDB(userId, {
          status: "under_review",
          checkrResult,
        });
        // Continue but flag for review
      }

      await updateKYCStatusInDB(userId, {
        checkrResult,
      });

      updateStep("background_check", "completed");
    }

    // =========================================================================
    // Step 5: Conditional - Accreditation (Accredited tier only)
    // =========================================================================
    if (tierConfig.requiresAccreditation) {
      updateStep("accreditation", "in_progress");

      const investorName = userData
        ? `${userData.firstName} ${userData.lastName}`
        : email.split("@")[0];

      // Create accreditation request
      const { requestId, verificationUrl } = await createAccreditationRequest(
        userId,
        email,
        investorName,
        "accredited_investor"
      );

      status.parallelRequestId = requestId;

      await updateKYCStatusInDB(userId, {
        parallelRequestId: requestId,
      });

      // Wait for accreditation completion (14 day timeout)
      const accreditationCompleted = await condition(
        () => accreditationSignalData !== undefined || cancelled,
        "14 days"
      );

      if (cancelled) {
        status.status = "rejected";
        throw ApplicationFailure.nonRetryable("KYC cancelled by user");
      }

      if (!accreditationCompleted || !accreditationSignalData) {
        status.status = "expired";
        await updateKYCStatusInDB(userId, {
          status: "expired",
          rejectionReason: "Accreditation verification timeout",
        });
        throw ApplicationFailure.nonRetryable("Accreditation verification timeout (14 days)");
      }

      // Process accreditation result
      const accreditationResult: AccreditationResult = {
        requestId,
        status: accreditationSignalData.status,
        method: accreditationSignalData.method,
        expiresAt: accreditationSignalData.expiresAt,
        completedAt: Date.now(),
      };
      status.accreditationResult = accreditationResult;

      if (accreditationSignalData.status === "rejected") {
        status.status = "rejected";
        await updateKYCStatusInDB(userId, {
          status: "rejected",
          accreditationResult,
          rejectionReason: accreditationSignalData.rejectionReason || "Accreditation not verified",
        });
        await sendKYCUserNotification(userId, email, "rejected", {
          reason: "Accreditation verification failed",
        });
        throw ApplicationFailure.nonRetryable("Accreditation verification failed");
      }

      if (accreditationSignalData.status === "expired") {
        status.status = "expired";
        await updateKYCStatusInDB(userId, {
          status: "expired",
          accreditationResult,
        });
        throw ApplicationFailure.nonRetryable("Accreditation has expired");
      }

      // Set expiration based on accreditation
      if (accreditationSignalData.expiresAt) {
        status.expiresAt = accreditationSignalData.expiresAt;
      }

      await updateKYCStatusInDB(userId, {
        accreditationResult,
        expiresAt: status.expiresAt,
      });

      updateStep("accreditation", "completed");
    }

    // =========================================================================
    // Step 6: Conditional - Bank Linking
    // =========================================================================
    if (requireBankLink) {
      updateStep("bank_linking", "in_progress");

      // Generate Plaid link token
      const { linkToken } = await createPlaidLinkToken(userId, ["auth", "identity"]);

      // Wait for Plaid link completion (1 hour timeout)
      const plaidCompleted = await condition(
        () => plaidSignalData !== undefined || cancelled,
        "1 hour"
      );

      if (cancelled) {
        status.status = "rejected";
        throw ApplicationFailure.nonRetryable("KYC cancelled by user");
      }

      if (!plaidCompleted || !plaidSignalData) {
        // Bank linking is optional, continue with warning
        updateStep("bank_linking", "failed", { error: "Bank linking timeout" });
      } else {
        // Exchange token and get auth data
        const { accessToken, itemId } = await exchangePlaidToken(plaidSignalData.publicToken);

        const plaidResult: PlaidResult = {
          itemId,
          accountId: plaidSignalData.accountId,
          institutionName: plaidSignalData.institutionName,
          accountMask: plaidSignalData.accountMask,
          linkedAt: Date.now(),
        };
        status.plaidResult = plaidResult;
        status.plaidItemId = itemId;

        await updateKYCStatusInDB(userId, {
          plaidItemId: itemId,
          plaidAccessToken: accessToken,
          plaidAccountId: plaidSignalData.accountId,
          plaidResult,
        });

        updateStep("bank_linking", "completed");
      }
    }

    // =========================================================================
    // Step 7: Finalize
    // =========================================================================
    updateStep("finalize", "in_progress");

    // Calculate expiration
    const expirationMs = KYC_EXPIRATION[targetTier];
    const expiresAt = status.expiresAt || (Date.now() + expirationMs);
    status.expiresAt = expiresAt;

    // Update final status
    status.status = "approved";
    status.completedAt = Date.now();

    await updateKYCStatusInDB(userId, {
      status: "approved",
      tier: targetTier,
      completedAt: status.completedAt,
      expiresAt,
    });

    // Log audit event
    await logAuditEvent({
      userId,
      action: "kyc.approved",
      metadata: {
        tier: targetTier,
        workflowId,
        completedAt: status.completedAt,
        expiresAt,
      },
    });

    // Send approval notification
    await sendKYCUserNotification(userId, email, "approved", {
      tier: targetTier,
      expiresAt: new Date(expiresAt).toISOString(),
    });

    updateStep("finalize", "completed");

    return {
      success: true,
      userId,
      tier: targetTier,
      status: "approved",
      completedAt: new Date(status.completedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  } catch (error) {
    // Log failure audit event
    try {
      await logAuditEvent({
        userId,
        action: "kyc.failed",
        metadata: {
          workflowId,
          error: error instanceof Error ? error.message : String(error),
          step: status.currentStep,
        },
      });
    } catch {
      // Ignore audit logging failures
    }

    // Re-throw the error
    throw error;
  }
}

export default onboardingKYCWorkflow;
