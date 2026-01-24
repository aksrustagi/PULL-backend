/**
 * KYC Upgrade Workflow (Enhanced)
 * Handles tier upgrades using Sumsub, Checkr, and Parallel Markets
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  ApplicationFailure,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "./activities";
import type {
  KYCUpgradeInput,
  KYCWorkflowOutput,
  KYCWorkflowStatus,
  KYCStep,
  SumsubCompletedSignal,
  CheckrCompletedSignal,
  AccreditationCompletedSignal,
  PlaidLinkedSignal,
  SumsubResult,
  CheckrResult,
  AccreditationResult,
  PlaidResult,
} from "./types";
import { TIER_CONFIG, KYC_EXPIRATION } from "./types";

// ==========================================================================
// ACTIVITY PROXIES
// ==========================================================================

const {
  getSumsubStatus,
  generateSumsubToken,
  resetSumsubApplicant,
  createCheckrCandidateAndReport,
  getCheckrReportStatus,
  createAccreditationRequest,
  getAccreditationStatus,
  createPlaidLinkToken,
  exchangePlaidToken,
  updateKYCStatusInDB,
  sendKYCUserNotification,
  logAuditEvent,
  getUserKYCStatus,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// ==========================================================================
// SIGNALS
// ==========================================================================

export const sumsubCompletedSignal = defineSignal<[SumsubCompletedSignal]>("sumsubCompleted");
export const checkrCompletedSignal = defineSignal<[CheckrCompletedSignal]>("checkrCompleted");
export const accreditationCompletedSignal = defineSignal<[AccreditationCompletedSignal]>("accreditationCompleted");
export const plaidLinkedSignal = defineSignal<[PlaidLinkedSignal]>("plaidLinked");
export const cancelUpgradeSignal = defineSignal<[]>("cancelUpgrade");

// ==========================================================================
// QUERIES
// ==========================================================================

export const getUpgradeStatusQuery = defineQuery<KYCWorkflowStatus>("getUpgradeStatus");

// ==========================================================================
// MAIN WORKFLOW
// ==========================================================================

/**
 * KYC Upgrade Workflow
 *
 * Handles tier upgrades:
 * - basic -> enhanced: Requires enhanced Sumsub level + Checkr background check
 * - enhanced -> accredited: Requires Parallel Markets accreditation verification
 */
export async function upgradeKYCWorkflow(
  input: KYCUpgradeInput
): Promise<KYCWorkflowOutput> {
  const { userId, email, currentTier, targetTier, requireBankLink } = input;
  const workflowId = workflowInfo().workflowId;
  const tierConfig = TIER_CONFIG[targetTier];

  // Validate upgrade path
  if (currentTier === "accredited") {
    throw ApplicationFailure.nonRetryable("Already at highest tier");
  }

  if (currentTier === "none" || currentTier === "basic") {
    if (targetTier === "accredited") {
      throw ApplicationFailure.nonRetryable("Must upgrade to enhanced tier first");
    }
  }

  if (currentTier === targetTier) {
    throw ApplicationFailure.nonRetryable(`Already at ${targetTier} tier`);
  }

  // Build steps based on upgrade path
  const steps: KYCStep[] = [
    { name: "validate", status: "pending" },
  ];

  // Enhanced tier: needs enhanced Sumsub + Checkr
  if (targetTier === "enhanced") {
    steps.push({ name: "sumsub_upgrade", status: "pending" });
    steps.push({ name: "background_check", status: "pending" });
  }

  // Accredited tier: needs Parallel Markets
  if (targetTier === "accredited") {
    steps.push({ name: "accreditation", status: "pending" });
  }

  // Optional bank linking
  if (requireBankLink) {
    steps.push({ name: "bank_linking", status: "pending" });
  }

  steps.push({ name: "finalize", status: "pending" });

  // Initialize workflow status
  const status: KYCWorkflowStatus = {
    workflowId,
    userId,
    targetTier,
    status: "pending",
    currentStep: "validate",
    progress: 0,
    steps,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };

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
  let cancelled = false;

  // Set up handlers
  setHandler(getUpgradeStatusQuery, () => status);
  setHandler(sumsubCompletedSignal, (signal) => { sumsubSignalData = signal; });
  setHandler(checkrCompletedSignal, (signal) => { checkrSignalData = signal; });
  setHandler(accreditationCompletedSignal, (signal) => { accreditationSignalData = signal; });
  setHandler(plaidLinkedSignal, (signal) => { plaidSignalData = signal; });
  setHandler(cancelUpgradeSignal, () => { cancelled = true; });

  try {
    // =========================================================================
    // Step 1: Validate
    // =========================================================================
    updateStep("validate", "in_progress");
    status.status = "in_progress";

    // Get current user KYC data
    const currentKYC = await getUserKYCStatus(userId);

    await logAuditEvent({
      userId,
      action: "kyc.upgrade_started",
      metadata: {
        currentTier,
        targetTier,
        workflowId,
      },
    });

    await updateKYCStatusInDB(userId, {
      status: "in_progress",
      workflowId,
    });

    updateStep("validate", "completed");

    // =========================================================================
    // Step 2: Enhanced Tier - Sumsub Upgrade + Background Check
    // =========================================================================
    if (targetTier === "enhanced") {
      // Upgrade Sumsub level
      updateStep("sumsub_upgrade", "in_progress");
      status.status = "awaiting_user_action";

      // Get existing applicant and generate new token for enhanced level
      const existingApplicantId = (currentKYC as any).sumsubApplicantId;
      if (existingApplicantId) {
        status.sumsubApplicantId = existingApplicantId;

        // Generate token for enhanced verification
        const { accessToken } = await generateSumsubToken(existingApplicantId, targetTier);
        status.sumsubAccessToken = accessToken;
      }

      // Wait for enhanced Sumsub completion
      const sumsubCompleted = await condition(
        () => sumsubSignalData !== undefined || cancelled,
        "24 hours"
      );

      if (cancelled) {
        throw ApplicationFailure.nonRetryable("Upgrade cancelled by user");
      }

      if (!sumsubCompleted || !sumsubSignalData) {
        status.status = "expired";
        throw ApplicationFailure.nonRetryable("Sumsub verification timeout");
      }

      if (sumsubSignalData.reviewAnswer !== "GREEN") {
        status.status = "rejected";
        throw ApplicationFailure.nonRetryable("Sumsub verification failed");
      }

      const sumsubResult: SumsubResult = {
        applicantId: sumsubSignalData.applicantId,
        reviewStatus: sumsubSignalData.reviewStatus,
        reviewAnswer: sumsubSignalData.reviewAnswer,
        rejectLabels: sumsubSignalData.rejectLabels,
        moderationComment: sumsubSignalData.moderationComment,
        completedAt: Date.now(),
      };
      status.sumsubResult = sumsubResult;

      updateStep("sumsub_upgrade", "completed");

      // Background check
      updateStep("background_check", "in_progress");

      // Get user data from current KYC for Checkr
      const userData = {
        firstName: (currentKYC as any).firstName ?? "",
        lastName: (currentKYC as any).lastName ?? "",
        dob: (currentKYC as any).dob ?? "",
        ssn: (currentKYC as any).ssn,
        phone: (currentKYC as any).phone,
        address: (currentKYC as any).address,
      };

      const { candidateId, reportId } = await createCheckrCandidateAndReport(
        userId,
        email,
        userData,
        "tasker_standard"
      );

      status.checkrCandidateId = candidateId;
      status.checkrReportId = reportId;

      await updateKYCStatusInDB(userId, {
        checkrCandidateId: candidateId,
        checkrReportId: reportId,
      });

      // Wait for Checkr completion
      const checkrCompleted = await condition(
        () => checkrSignalData !== undefined || cancelled,
        "7 days"
      );

      if (cancelled) {
        throw ApplicationFailure.nonRetryable("Upgrade cancelled by user");
      }

      if (!checkrCompleted || !checkrSignalData) {
        status.status = "expired";
        throw ApplicationFailure.nonRetryable("Background check timeout");
      }

      if (checkrSignalData.result === "adverse_action") {
        status.status = "rejected";
        throw ApplicationFailure.nonRetryable("Background check failed");
      }

      const checkrResult: CheckrResult = {
        candidateId,
        reportId: checkrSignalData.reportId,
        status: checkrSignalData.status,
        result: checkrSignalData.result,
        completedAt: Date.now(),
      };
      status.checkrResult = checkrResult;

      await updateKYCStatusInDB(userId, { checkrResult });

      updateStep("background_check", "completed");
    }

    // =========================================================================
    // Step 3: Accredited Tier - Parallel Markets
    // =========================================================================
    if (targetTier === "accredited") {
      updateStep("accreditation", "in_progress");

      const investorName = (currentKYC as any).firstName && (currentKYC as any).lastName
        ? `${(currentKYC as any).firstName} ${(currentKYC as any).lastName}`
        : email.split("@")[0];

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

      await sendKYCUserNotification(userId, email, "action_required", {
        message: "Please complete accredited investor verification",
        verificationUrl,
      });

      // Wait for accreditation
      const accreditationCompleted = await condition(
        () => accreditationSignalData !== undefined || cancelled,
        "14 days"
      );

      if (cancelled) {
        throw ApplicationFailure.nonRetryable("Upgrade cancelled by user");
      }

      if (!accreditationCompleted || !accreditationSignalData) {
        status.status = "expired";
        throw ApplicationFailure.nonRetryable("Accreditation timeout");
      }

      if (accreditationSignalData.status !== "approved") {
        status.status = "rejected";
        throw ApplicationFailure.nonRetryable(
          accreditationSignalData.rejectionReason || "Accreditation failed"
        );
      }

      const accreditationResult: AccreditationResult = {
        requestId,
        status: accreditationSignalData.status,
        method: accreditationSignalData.method,
        expiresAt: accreditationSignalData.expiresAt,
        completedAt: Date.now(),
      };
      status.accreditationResult = accreditationResult;
      status.expiresAt = accreditationSignalData.expiresAt;

      await updateKYCStatusInDB(userId, {
        accreditationResult,
        expiresAt: status.expiresAt,
      });

      updateStep("accreditation", "completed");
    }

    // =========================================================================
    // Step 4: Optional Bank Linking
    // =========================================================================
    if (requireBankLink) {
      updateStep("bank_linking", "in_progress");

      const { linkToken } = await createPlaidLinkToken(userId, ["auth", "identity"]);

      const plaidCompleted = await condition(
        () => plaidSignalData !== undefined || cancelled,
        "1 hour"
      );

      if (plaidCompleted && plaidSignalData) {
        const { accessToken, itemId } = await exchangePlaidToken(plaidSignalData.publicToken);

        const plaidResult: PlaidResult = {
          itemId,
          accountId: plaidSignalData.accountId,
          institutionName: plaidSignalData.institutionName,
          accountMask: plaidSignalData.accountMask,
          linkedAt: Date.now(),
        };
        status.plaidResult = plaidResult;

        await updateKYCStatusInDB(userId, {
          plaidItemId: itemId,
          plaidAccessToken: accessToken,
          plaidAccountId: plaidSignalData.accountId,
        });

        updateStep("bank_linking", "completed");
      } else {
        updateStep("bank_linking", "skipped", { error: "Timeout or cancelled" });
      }
    }

    // =========================================================================
    // Step 5: Finalize
    // =========================================================================
    updateStep("finalize", "in_progress");

    const expirationMs = KYC_EXPIRATION[targetTier];
    const expiresAt = status.expiresAt || (Date.now() + expirationMs);
    status.expiresAt = expiresAt;
    status.status = "approved";
    status.completedAt = Date.now();

    await updateKYCStatusInDB(userId, {
      status: "approved",
      tier: targetTier,
      completedAt: status.completedAt,
      expiresAt,
    });

    await logAuditEvent({
      userId,
      action: "kyc.upgrade_completed",
      metadata: {
        previousTier: currentTier,
        newTier: targetTier,
        workflowId,
      },
    });

    await sendKYCUserNotification(userId, email, "approved", {
      message: `Your account has been upgraded to ${targetTier} tier!`,
      tier: targetTier,
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
    await logAuditEvent({
      userId,
      action: "kyc.upgrade_failed",
      metadata: {
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}

export default upgradeKYCWorkflow;
