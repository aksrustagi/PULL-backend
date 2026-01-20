/**
 * Periodic Re-KYC Workflow
 * Handles scheduled re-verification of user KYC status
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  sleep,
  continueAsNew,
  ApplicationFailure,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies with retry policies
const {
  getUserKYCStatus,
  getUserLastVerificationDate,
  checkDocumentExpiration,
  runSanctionsScreening,
  runWatchlistScreening,
  runPEPScreening,
  initiateReVerification,
  suspendUserAccount,
  sendKYCStatusNotification,
  sendReKYCReminder,
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

// Extended timeout activities
const {
  waitForReVerificationCompletion,
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
export interface PeriodicReKYCInput {
  userId: string;
  lastCheckTimestamp?: string;
}

// Re-KYC status type
export interface ReKYCStatus {
  lastCheck: string;
  nextScheduledCheck: string;
  documentExpirationStatus: "valid" | "expiring_soon" | "expired";
  sanctionsStatus: "clear" | "flagged" | "pending";
  watchlistStatus: "clear" | "flagged" | "pending";
  pepStatus: "clear" | "flagged" | "pending";
  reVerificationRequired: boolean;
  reVerificationInProgress: boolean;
  accountSuspended: boolean;
  issues: string[];
}

// Configuration
const REKYC_INTERVALS = {
  basic: 365, // 1 year for basic tier
  enhanced: 180, // 6 months for enhanced tier
  accredited: 90, // 3 months for accredited tier
} as const;

const DOCUMENT_EXPIRY_WARNING_DAYS = 30;

// Signals
export const reVerificationCompletedSignal = defineSignal<[{ success: boolean; verificationId: string }]>("reVerificationCompleted");
export const manualOverrideSignal = defineSignal<[{ action: "approve" | "suspend"; reason: string }]>("manualOverride");

// Queries
export const getReKYCStatusQuery = defineQuery<ReKYCStatus>("getReKYCStatus");

/**
 * Periodic Re-KYC Workflow
 * Runs on a schedule to check user KYC status
 */
export async function periodicReKYCWorkflow(
  input: PeriodicReKYCInput
): Promise<ReKYCStatus> {
  const { userId, lastCheckTimestamp } = input;

  // Get user's current KYC status
  const currentKYC = await getUserKYCStatus(userId);
  const lastVerification = await getUserLastVerificationDate(userId);

  // Initialize status
  const status: ReKYCStatus = {
    lastCheck: lastCheckTimestamp ?? new Date().toISOString(),
    nextScheduledCheck: calculateNextCheck(currentKYC.tier),
    documentExpirationStatus: "valid",
    sanctionsStatus: "pending",
    watchlistStatus: "pending",
    pepStatus: "pending",
    reVerificationRequired: false,
    reVerificationInProgress: false,
    accountSuspended: false,
    issues: [],
  };

  // Set up query handler
  setHandler(getReKYCStatusQuery, () => status);

  // Track signals
  let reVerificationResult: { success: boolean; verificationId: string } | undefined;
  let manualOverride: { action: "approve" | "suspend"; reason: string } | undefined;

  setHandler(reVerificationCompletedSignal, (result) => {
    reVerificationResult = result;
  });

  setHandler(manualOverrideSignal, (override) => {
    manualOverride = override;
  });

  try {
    // Log check start
    await logAuditEvent({
      userId,
      action: "rekyc_check_started",
      metadata: { tier: currentKYC.tier },
    });

    // =========================================================================
    // Step 1: Check document expiration
    // =========================================================================
    const docExpiration = await checkDocumentExpiration(userId);

    if (docExpiration.anyExpired) {
      status.documentExpirationStatus = "expired";
      status.issues.push(`Expired documents: ${docExpiration.expiredDocuments.join(", ")}`);
      status.reVerificationRequired = true;
    } else if (docExpiration.expiringWithinDays(DOCUMENT_EXPIRY_WARNING_DAYS)) {
      status.documentExpirationStatus = "expiring_soon";
      status.issues.push(`Documents expiring soon: ${docExpiration.expiringDocuments.join(", ")}`);

      // Send reminder notification
      await sendReKYCReminder(
        currentKYC.email,
        "document_expiring",
        `Your ${docExpiration.expiringDocuments.join(", ")} will expire within ${DOCUMENT_EXPIRY_WARNING_DAYS} days`
      );
    }

    // =========================================================================
    // Step 2: Run parallel screenings
    // =========================================================================
    const [sanctionsResult, watchlistResult, pepResult] = await Promise.all([
      runSanctionsScreening(userId, currentKYC),
      runWatchlistScreening(userId, currentKYC),
      runPEPScreening(userId, currentKYC),
    ]);

    // Process sanctions result
    if (sanctionsResult.matched) {
      status.sanctionsStatus = "flagged";
      status.issues.push(`Sanctions match: ${sanctionsResult.matchDetails}`);
      status.reVerificationRequired = true;
    } else {
      status.sanctionsStatus = "clear";
    }

    // Process watchlist result
    if (watchlistResult.matched) {
      status.watchlistStatus = "flagged";
      status.issues.push(`Watchlist match: ${watchlistResult.matchDetails}`);
      status.reVerificationRequired = true;
    } else {
      status.watchlistStatus = "clear";
    }

    // Process PEP result
    if (pepResult.matched) {
      status.pepStatus = "flagged";
      status.issues.push(`PEP match: ${pepResult.matchDetails}`);
      // PEP doesn't auto-require re-verification but flags for enhanced monitoring
    } else {
      status.pepStatus = "clear";
    }

    // =========================================================================
    // Step 3: Check if periodic re-verification is due
    // =========================================================================
    const daysSinceLastVerification = calculateDaysSince(lastVerification);
    const reKYCIntervalDays = REKYC_INTERVALS[currentKYC.tier as keyof typeof REKYC_INTERVALS];

    if (daysSinceLastVerification >= reKYCIntervalDays) {
      status.reVerificationRequired = true;
      status.issues.push(`Periodic re-verification due (${daysSinceLastVerification} days since last verification)`);
    }

    // =========================================================================
    // Step 4: Handle critical issues (immediate suspension)
    // =========================================================================
    const criticalIssues = status.sanctionsStatus === "flagged";

    if (criticalIssues) {
      // Immediately suspend account for sanctions matches
      await suspendUserAccount(userId, "Sanctions screening match - pending review");
      status.accountSuspended = true;

      await logAuditEvent({
        userId,
        action: "account_suspended_sanctions",
        metadata: { issues: status.issues },
      });

      await sendKYCStatusNotification(
        currentKYC.email,
        "account_suspended",
        "Your account has been suspended pending compliance review. Please contact support."
      );

      // Wait for manual override
      const override = await condition(
        () => manualOverride !== undefined,
        "30 days"
      );

      if (override && manualOverride?.action === "approve") {
        // Reinstate account
        status.accountSuspended = false;
        status.issues = status.issues.filter(i => !i.includes("Sanctions"));
        await logAuditEvent({
          userId,
          action: "account_reinstated",
          metadata: { reason: manualOverride.reason },
        });
      } else {
        // Maintain suspension
        throw ApplicationFailure.nonRetryable("Account suspended - manual review required");
      }
    }

    // =========================================================================
    // Step 5: Initiate re-verification if required
    // =========================================================================
    if (status.reVerificationRequired && !status.accountSuspended) {
      status.reVerificationInProgress = true;

      // Send re-verification notification
      await sendReKYCReminder(
        currentKYC.email,
        "reverification_required",
        "Your account requires re-verification. Please complete the process within 30 days."
      );

      // Initiate re-verification
      const reVerification = await initiateReVerification(userId, {
        reason: status.issues.join("; "),
        requiredDocuments: status.documentExpirationStatus !== "valid"
          ? ["government_id", "proof_of_address"]
          : [],
      });

      // Wait for re-verification completion (30 day timeout)
      const reVerificationComplete = await condition(
        () => reVerificationResult !== undefined,
        "30 days"
      );

      if (!reVerificationComplete) {
        // Suspend account for non-compliance
        await suspendUserAccount(userId, "Re-verification not completed within 30 days");
        status.accountSuspended = true;

        await logAuditEvent({
          userId,
          action: "account_suspended_rekyc_timeout",
          metadata: { issues: status.issues },
        });
      } else if (reVerificationResult?.success) {
        status.reVerificationInProgress = false;
        status.issues = [];
        status.documentExpirationStatus = "valid";

        await logAuditEvent({
          userId,
          action: "rekyc_completed_success",
          metadata: { verificationId: reVerificationResult.verificationId },
        });
      } else {
        // Re-verification failed
        await suspendUserAccount(userId, "Re-verification failed");
        status.accountSuspended = true;

        await logAuditEvent({
          userId,
          action: "account_suspended_rekyc_failed",
          metadata: { verificationId: reVerificationResult?.verificationId },
        });
      }
    }

    // =========================================================================
    // Step 6: Log completion and schedule next check
    // =========================================================================
    status.lastCheck = new Date().toISOString();
    status.nextScheduledCheck = calculateNextCheck(currentKYC.tier);

    await logAuditEvent({
      userId,
      action: "rekyc_check_completed",
      metadata: {
        issues: status.issues.length,
        accountSuspended: status.accountSuspended,
        nextCheck: status.nextScheduledCheck,
      },
    });

    // Continue as new to prevent history buildup (for long-running cron workflows)
    if (!status.accountSuspended) {
      await sleep("24 hours"); // Wait until next scheduled run

      await continueAsNew<typeof periodicReKYCWorkflow>({
        userId,
        lastCheckTimestamp: status.lastCheck,
      });
    }

    return status;
  } catch (error) {
    await logAuditEvent({
      userId,
      action: "rekyc_check_failed",
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}

// Helper functions
function calculateNextCheck(tier: string): string {
  const intervalDays = REKYC_INTERVALS[tier as keyof typeof REKYC_INTERVALS] ?? 365;
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + intervalDays);
  return nextDate.toISOString();
}

function calculateDaysSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
