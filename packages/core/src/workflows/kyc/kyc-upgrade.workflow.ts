/**
 * KYC Upgrade Workflow
 * Handles tier upgrades from basic -> enhanced -> accredited
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  ApplicationFailure,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies with retry policies
const {
  getUserKYCStatus,
  initiateEnhancedVerification,
  initiateAccreditedVerification,
  verifyIncomeDocuments,
  verifyNetWorthDocuments,
  verifyAccreditedInvestorLetter,
  requestAdditionalDocuments,
  updateKYCTier,
  sendKYCStatusNotification,
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

// Extended timeout activities for document verification
const {
  waitForDocumentVerification,
  performManualReview,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: "1 minute",
  retry: {
    initialInterval: "10 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "2 minutes",
  },
});

// Workflow input type
export interface KYCUpgradeInput {
  userId: string;
  targetTier: "enhanced" | "accredited";
  documents?: string[];
}

// Upgrade status type
export interface KYCUpgradeStatus {
  currentTier: "basic" | "enhanced" | "accredited";
  targetTier: "enhanced" | "accredited";
  step:
    | "validating"
    | "document_verification"
    | "income_verification"
    | "net_worth_verification"
    | "accredited_letter_verification"
    | "manual_review"
    | "approval"
    | "completed"
    | "rejected";
  documentsSubmitted: boolean;
  documentsVerified: boolean;
  incomeVerified: boolean;
  netWorthVerified: boolean;
  accreditedLetterVerified: boolean;
  manualReviewRequired: boolean;
  manualReviewCompleted: boolean;
  failureReason?: string;
  additionalDocumentsRequired?: string[];
}

// Signals
export const documentsSubmittedSignal = defineSignal<[{ documentIds: string[] }]>("documentsSubmitted");
export const additionalDocumentsSubmittedSignal = defineSignal<[{ documentIds: string[] }]>("additionalDocumentsSubmitted");
export const manualReviewCompletedSignal = defineSignal<[{ approved: boolean; notes?: string }]>("manualReviewCompleted");

// Queries
export const getUpgradeStatusQuery = defineQuery<KYCUpgradeStatus>("getUpgradeStatus");

/**
 * KYC Upgrade Workflow
 */
export async function kycUpgradeWorkflow(
  input: KYCUpgradeInput
): Promise<{ success: boolean; newTier?: string; status: KYCUpgradeStatus }> {
  const { userId, targetTier, documents } = input;

  // Get current KYC status
  const currentKYC = await getUserKYCStatus(userId);

  // Initialize status
  const status: KYCUpgradeStatus = {
    currentTier: currentKYC.tier as "basic" | "enhanced" | "accredited",
    targetTier,
    step: "validating",
    documentsSubmitted: documents !== undefined && documents.length > 0,
    documentsVerified: false,
    incomeVerified: false,
    netWorthVerified: false,
    accreditedLetterVerified: false,
    manualReviewRequired: false,
    manualReviewCompleted: false,
  };

  // Set up query handler
  setHandler(getUpgradeStatusQuery, () => status);

  // Track submitted documents
  let submittedDocumentIds: string[] = documents ?? [];
  let additionalDocumentIds: string[] = [];
  let manualReviewResult: { approved: boolean; notes?: string } | undefined;

  // Set up signal handlers
  setHandler(documentsSubmittedSignal, ({ documentIds }) => {
    submittedDocumentIds = documentIds;
    status.documentsSubmitted = true;
  });

  setHandler(additionalDocumentsSubmittedSignal, ({ documentIds }) => {
    additionalDocumentIds = documentIds;
  });

  setHandler(manualReviewCompletedSignal, (result) => {
    manualReviewResult = result;
    status.manualReviewCompleted = true;
  });

  try {
    // Log upgrade attempt
    await logAuditEvent({
      userId,
      action: "kyc_upgrade_started",
      metadata: {
        currentTier: status.currentTier,
        targetTier,
      },
    });

    // =========================================================================
    // Validation
    // =========================================================================

    // Validate upgrade path
    if (status.currentTier === "accredited") {
      throw ApplicationFailure.nonRetryable("Already at highest tier");
    }

    if (status.currentTier === "basic" && targetTier === "accredited") {
      throw ApplicationFailure.nonRetryable("Must upgrade to enhanced tier first");
    }

    if (status.currentTier === "enhanced" && targetTier === "enhanced") {
      throw ApplicationFailure.nonRetryable("Already at enhanced tier");
    }

    // Wait for documents if not submitted
    if (!status.documentsSubmitted) {
      const docsReceived = await condition(
        () => status.documentsSubmitted,
        "14 days"
      );

      if (!docsReceived) {
        status.step = "rejected";
        status.failureReason = "Document submission timeout (14 days)";
        throw ApplicationFailure.nonRetryable("Document submission timeout");
      }
    }

    status.step = "document_verification";

    // =========================================================================
    // Enhanced Tier Verification
    // =========================================================================
    if (targetTier === "enhanced") {
      // Initiate enhanced verification
      const verificationResult = await initiateEnhancedVerification(
        userId,
        submittedDocumentIds
      );

      // Wait for document verification
      const docVerificationResult = await waitForDocumentVerification(
        verificationResult.verificationId
      );

      if (docVerificationResult.status === "rejected") {
        status.step = "rejected";
        status.failureReason = docVerificationResult.reason;
        await sendKYCStatusNotification(
          currentKYC.email,
          "upgrade_rejected",
          docVerificationResult.reason
        );
        throw ApplicationFailure.nonRetryable("Document verification failed");
      }

      if (docVerificationResult.status === "needs_additional") {
        status.additionalDocumentsRequired = docVerificationResult.requiredDocuments;
        await requestAdditionalDocuments(userId, docVerificationResult.requiredDocuments!);

        // Wait for additional documents
        const additionalReceived = await condition(
          () => additionalDocumentIds.length > 0,
          "7 days"
        );

        if (!additionalReceived) {
          status.step = "rejected";
          status.failureReason = "Additional documents timeout (7 days)";
          throw ApplicationFailure.nonRetryable("Additional documents timeout");
        }

        // Re-verify with additional documents
        const reVerification = await waitForDocumentVerification(
          verificationResult.verificationId,
          additionalDocumentIds
        );

        if (reVerification.status !== "approved") {
          status.step = "rejected";
          status.failureReason = reVerification.reason;
          throw ApplicationFailure.nonRetryable("Re-verification failed");
        }
      }

      status.documentsVerified = true;
    }

    // =========================================================================
    // Accredited Tier Verification
    // =========================================================================
    if (targetTier === "accredited") {
      // Initiate accredited verification
      const accreditedVerification = await initiateAccreditedVerification(
        userId,
        submittedDocumentIds
      );

      // Income verification
      status.step = "income_verification";
      const incomeResult = await verifyIncomeDocuments(
        userId,
        accreditedVerification.incomeDocumentIds
      );

      if (incomeResult.verified) {
        status.incomeVerified = true;
      } else if (incomeResult.alternatePathAvailable) {
        // Try net worth verification as alternative
        status.step = "net_worth_verification";
        const netWorthResult = await verifyNetWorthDocuments(
          userId,
          accreditedVerification.netWorthDocumentIds
        );

        if (netWorthResult.verified) {
          status.netWorthVerified = true;
        } else {
          // Check for accredited investor letter as last resort
          status.step = "accredited_letter_verification";
          const letterResult = await verifyAccreditedInvestorLetter(
            userId,
            accreditedVerification.letterDocumentId
          );

          if (letterResult.verified) {
            status.accreditedLetterVerified = true;
          } else {
            status.step = "rejected";
            status.failureReason = "Unable to verify accredited investor status";
            await sendKYCStatusNotification(
              currentKYC.email,
              "upgrade_rejected",
              "Unable to verify accredited investor status"
            );
            throw ApplicationFailure.nonRetryable("Accredited verification failed");
          }
        }
      }

      status.documentsVerified = true;
    }

    // =========================================================================
    // Manual Review (if required)
    // =========================================================================
    if (status.manualReviewRequired) {
      status.step = "manual_review";

      // Trigger manual review
      await performManualReview(userId, {
        targetTier,
        documents: submittedDocumentIds,
        additionalDocuments: additionalDocumentIds,
      });

      // Wait for manual review completion
      const reviewCompleted = await condition(
        () => status.manualReviewCompleted,
        "14 days"
      );

      if (!reviewCompleted) {
        status.step = "rejected";
        status.failureReason = "Manual review timeout (14 days)";
        throw ApplicationFailure.nonRetryable("Manual review timeout");
      }

      if (!manualReviewResult?.approved) {
        status.step = "rejected";
        status.failureReason = manualReviewResult?.notes ?? "Manual review rejected";
        await sendKYCStatusNotification(
          currentKYC.email,
          "upgrade_rejected",
          manualReviewResult?.notes
        );
        throw ApplicationFailure.nonRetryable("Manual review rejected");
      }
    }

    // =========================================================================
    // Approval and Finalization
    // =========================================================================
    status.step = "approval";

    // Update KYC tier
    await updateKYCTier(userId, targetTier);

    // Log successful upgrade
    await logAuditEvent({
      userId,
      action: "kyc_upgrade_completed",
      metadata: {
        previousTier: status.currentTier,
        newTier: targetTier,
      },
    });

    // Send success notification
    await sendKYCStatusNotification(
      currentKYC.email,
      "upgrade_approved",
      `Your account has been upgraded to ${targetTier} tier!`
    );

    status.step = "completed";

    return {
      success: true,
      newTier: targetTier,
      status,
    };
  } catch (error) {
    // Log failed upgrade
    await logAuditEvent({
      userId,
      action: "kyc_upgrade_failed",
      metadata: {
        targetTier,
        reason: status.failureReason,
      },
    });

    return {
      success: false,
      status,
    };
  }
}
