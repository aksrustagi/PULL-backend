/**
 * Compliance Inngest Functions
 * KYC checks, AML screening, and regulatory compliance
 */

import { inngest, CRON_SCHEDULES, DEFAULT_RETRY_CONFIG, CRITICAL_RETRY_CONFIG } from "../client";

// ============================================================================
// Compliance Configuration
// ============================================================================

const KYC_EXPIRY_DAYS = {
  basic: 365,
  standard: 365,
  enhanced: 180,
  accredited: 90,
};

const WATCHLIST_SOURCES = [
  "ofac_sdn",
  "ofac_consolidated",
  "eu_consolidated",
  "uk_sanctions",
  "un_sanctions",
  "pep_lists",
  "adverse_media",
] as const;

const RISK_SCORE_THRESHOLDS = {
  low: 30,
  medium: 60,
  high: 80,
  critical: 95,
};

// ============================================================================
// Periodic KYC Check Function
// ============================================================================

/**
 * Check for expiring KYC and re-screen users
 * Runs weekly on Sundays at midnight
 */
export const periodicKYCCheck = inngest.createFunction(
  {
    id: "pull/compliance/periodic-kyc-check",
    name: "Periodic KYC Check",
    retries: CRITICAL_RETRY_CONFIG.attempts,
    concurrency: {
      limit: 1,
    },
  },
  { cron: CRON_SCHEDULES.WEEKLY_SUNDAY_MIDNIGHT },
  async ({ step, logger }) => {
    logger.info("Starting periodic KYC check");

    // Step 1: Get users with KYC nearing expiry
    const expiringUsers = await step.run("get-expiring-kyc", async () => {
      // In production: query from Convex
      // return await convex.query(api.compliance.getUsersWithExpiringKYC, {
      //   daysUntilExpiry: 30,
      // });
      return [] as Array<{
        userId: string;
        email: string;
        kycTier: keyof typeof KYC_EXPIRY_DAYS;
        kycCompletedAt: number;
        expiresAt: number;
        daysUntilExpiry: number;
      }>;
    });

    logger.info("Found users with expiring KYC", { count: expiringUsers.length });

    // Step 2: Get all active users for watchlist re-screening
    const activeUsers = await step.run("get-active-users-for-screening", async () => {
      // In production: query users who have traded in the last month
      // return await convex.query(api.compliance.getActiveUsersForScreening);
      return [] as Array<{
        userId: string;
        fullName: string;
        dateOfBirth: string;
        nationality: string;
        addresses: Array<{ country: string }>;
        lastScreenedAt: number;
        riskScore: number;
      }>;
    });

    logger.info("Found active users for screening", { count: activeUsers.length });

    const results = {
      expiryNotificationsSent: 0,
      usersRescreened: 0,
      watchlistMatches: 0,
      flaggedForReview: 0,
    };

    // Step 3: Send expiry notifications
    for (const user of expiringUsers) {
      await step.run(`notify-expiry-${user.userId}`, async () => {
        // Determine urgency
        const isUrgent = user.daysUntilExpiry <= 7;
        const isWarning = user.daysUntilExpiry <= 14;

        // Send notification
        await step.sendEvent(`kyc-expiry-notify-${user.userId}`, {
          name: "notification/send",
          data: {
            userId: user.userId,
            type: isUrgent ? "kyc_rejected" : "tier_upgraded", // Reusing types
            title: isUrgent
              ? "KYC Expiring Soon - Action Required"
              : "KYC Renewal Reminder",
            body: isUrgent
              ? `Your KYC verification expires in ${user.daysUntilExpiry} days. Please renew to continue trading.`
              : `Your KYC verification will expire in ${user.daysUntilExpiry} days. Consider renewing early.`,
            data: {
              kycTier: user.kycTier,
              expiresAt: user.expiresAt,
              daysUntilExpiry: user.daysUntilExpiry,
            },
            channels: isUrgent
              ? ["push", "email", "in_app"]
              : isWarning
                ? ["email", "in_app"]
                : ["in_app"],
          },
        });

        results.expiryNotificationsSent++;
      });
    }

    // Step 4: Re-screen users against watchlists
    const batchSize = 50;
    for (let i = 0; i < activeUsers.length; i += batchSize) {
      const batch = activeUsers.slice(i, i + batchSize);

      const screeningResults = await step.run(`screen-batch-${i}`, async () => {
        const batchResults = [];

        for (const user of batch) {
          try {
            // In production: use Persona or similar AML screening service
            // const screening = await persona.screenIndividual({
            //   name: user.fullName,
            //   dateOfBirth: user.dateOfBirth,
            //   nationality: user.nationality,
            //   countries: user.addresses.map(a => a.country),
            // });

            // Simulated screening result
            const screening = {
              matches: [] as Array<{
                source: string;
                matchScore: number;
                listType: string;
                matchedName: string;
              }>,
              riskScore: Math.floor(Math.random() * 100),
              screenedAt: Date.now(),
            };

            batchResults.push({
              userId: user.userId,
              hasMatches: screening.matches.length > 0,
              matchCount: screening.matches.length,
              newRiskScore: screening.riskScore,
              previousRiskScore: user.riskScore,
              riskScoreChange: screening.riskScore - user.riskScore,
              matches: screening.matches,
            });
          } catch (error) {
            logger.error("Screening failed for user", {
              userId: user.userId,
              error: (error as Error).message,
            });
            batchResults.push({
              userId: user.userId,
              hasMatches: false,
              matchCount: 0,
              newRiskScore: user.riskScore,
              previousRiskScore: user.riskScore,
              riskScoreChange: 0,
              matches: [],
              error: (error as Error).message,
            });
          }
        }

        return batchResults;
      });

      // Process screening results
      for (const result of screeningResults) {
        results.usersRescreened++;

        if (result.hasMatches) {
          results.watchlistMatches++;
        }

        // Check if user needs to be flagged for review
        const needsReview =
          result.hasMatches ||
          result.newRiskScore >= RISK_SCORE_THRESHOLDS.high ||
          result.riskScoreChange >= 20;

        if (needsReview) {
          results.flaggedForReview++;

          await step.run(`flag-for-review-${result.userId}`, async () => {
            // In production: create review case in Convex
            // await convex.mutation(api.compliance.createReviewCase, {
            //   userId: result.userId,
            //   reason: result.hasMatches ? "watchlist_match" : "risk_score_increase",
            //   riskScore: result.newRiskScore,
            //   matches: result.matches,
            //   priority: result.newRiskScore >= RISK_SCORE_THRESHOLDS.critical
            //     ? "critical"
            //     : result.newRiskScore >= RISK_SCORE_THRESHOLDS.high
            //       ? "high"
            //       : "medium",
            // });

            // Send event for compliance team
            await step.sendEvent(`compliance-alert-${result.userId}`, {
              name: "compliance/review.required",
              data: {
                userId: result.userId,
                reason: result.hasMatches ? "watchlist_match" : "risk_score_increase",
                riskScore: result.newRiskScore,
                matchCount: result.matchCount,
              },
            });
          });
        }

        // Update user's screening record
        await step.run(`update-screening-${result.userId}`, async () => {
          // In production: update in Convex
          // await convex.mutation(api.compliance.updateScreeningRecord, {
          //   userId: result.userId,
          //   lastScreenedAt: Date.now(),
          //   riskScore: result.newRiskScore,
          //   matchCount: result.matchCount,
          // });
        });
      }
    }

    // Step 5: Generate compliance report
    await step.run("generate-weekly-report", async () => {
      // In production: store report in Convex
      // await convex.mutation(api.compliance.storeWeeklyReport, {
      //   reportDate: Date.now(),
      //   expiringKYCCount: expiringUsers.length,
      //   usersScreened: results.usersRescreened,
      //   watchlistMatches: results.watchlistMatches,
      //   flaggedForReview: results.flaggedForReview,
      // });
    });

    // Step 6: Alert compliance team if critical issues found
    if (results.flaggedForReview > 0) {
      await step.run("alert-compliance-team", async () => {
        // In production: send to compliance team
        // await sendSlackNotification(COMPLIANCE_CHANNEL, {
        //   text: `Weekly Compliance Report: ${results.flaggedForReview} users flagged for review`,
        //   blocks: [
        //     { type: "section", text: { type: "mrkdwn", text: `*Users Screened:* ${results.usersRescreened}` } },
        //     { type: "section", text: { type: "mrkdwn", text: `*Watchlist Matches:* ${results.watchlistMatches}` } },
        //     { type: "section", text: { type: "mrkdwn", text: `*Flagged for Review:* ${results.flaggedForReview}` } },
        //   ],
        // });
      });
    }

    return {
      expiringKYCUsers: expiringUsers.length,
      ...results,
      completedAt: Date.now(),
    };
  }
);

// ============================================================================
// Process KYC Verification Function
// ============================================================================

/**
 * Process completed KYC verification from Persona
 * Triggered by webhook event
 */
export const processKYCVerification = inngest.createFunction(
  {
    id: "pull/compliance/process-kyc-verification",
    name: "Process KYC Verification",
    retries: CRITICAL_RETRY_CONFIG.attempts,
    concurrency: {
      limit: 3,
    },
  },
  { event: "compliance/kyc.submitted" },
  async ({ event, step, logger }) => {
    const { userId, inquiryId, status, verificationData } = event.data;

    logger.info("Processing KYC verification", { userId, inquiryId, status });

    // Step 1: Fetch full verification details
    const verification = await step.run("fetch-verification-details", async () => {
      // In production: fetch from Persona API
      // const persona = new PersonaClient({ apiKey: process.env.PERSONA_API_KEY });
      // return await persona.getInquiry(inquiryId);
      return {
        status,
        tier: "standard" as keyof typeof KYC_EXPIRY_DAYS,
        verifications: {
          governmentId: { status: "passed", confidence: 95 },
          selfie: { status: "passed", confidence: 90 },
          address: { status: "passed", confidence: 85 },
        },
        extractedData: {
          firstName: "John",
          lastName: "Doe",
          dateOfBirth: "1990-01-01",
          address: {
            street: "123 Main St",
            city: "New York",
            state: "NY",
            postalCode: "10001",
            country: "US",
          },
        },
        riskSignals: [] as string[],
      };
    });

    // Step 2: Run additional AML screening
    const amlScreening = await step.run("run-aml-screening", async () => {
      // In production: run through AML provider
      return {
        passed: true,
        matches: [] as Array<{
          source: string;
          matchScore: number;
          name: string;
        }>,
        riskScore: 15,
      };
    });

    // Step 3: Determine final KYC status
    const finalStatus = await step.run("determine-final-status", async () => {
      const allVerificationsPassed = Object.values(verification.verifications).every(
        (v) => v.status === "passed"
      );

      if (!allVerificationsPassed) {
        return {
          approved: false,
          reason: "verification_failed",
          requiresManualReview: true,
        };
      }

      if (!amlScreening.passed || amlScreening.matches.length > 0) {
        return {
          approved: false,
          reason: "aml_flag",
          requiresManualReview: true,
        };
      }

      if (amlScreening.riskScore >= RISK_SCORE_THRESHOLDS.medium) {
        return {
          approved: false,
          reason: "high_risk_score",
          requiresManualReview: true,
        };
      }

      return {
        approved: true,
        reason: "all_checks_passed",
        requiresManualReview: false,
      };
    });

    // Step 4: Update user KYC status
    await step.run("update-kyc-status", async () => {
      const expiryDays = KYC_EXPIRY_DAYS[verification.tier];
      const expiresAt = Date.now() + expiryDays * 24 * 60 * 60 * 1000;

      // In production: update in Convex
      // await convex.mutation(api.compliance.updateKYCStatus, {
      //   userId,
      //   inquiryId,
      //   status: finalStatus.approved ? "approved" : "pending_review",
      //   tier: verification.tier,
      //   verifiedAt: finalStatus.approved ? Date.now() : null,
      //   expiresAt: finalStatus.approved ? expiresAt : null,
      //   extractedData: verification.extractedData,
      //   riskScore: amlScreening.riskScore,
      //   requiresManualReview: finalStatus.requiresManualReview,
      // });
    });

    // Step 5: Send appropriate event
    if (finalStatus.approved) {
      // KYC approved - enable trading
      await step.sendEvent("kyc-approved", {
        name: "compliance/kyc.approved",
        data: {
          userId,
          tier: verification.tier,
          approvedAt: Date.now(),
        },
      });

      // Award points for KYC completion
      await step.sendEvent("kyc-points", {
        name: "rewards/action.completed",
        data: {
          userId,
          actionType: "kyc_completed",
          metadata: { tier: verification.tier },
        },
      });

      // Send notification
      await step.sendEvent("notify-approved", {
        name: "notification/send",
        data: {
          userId,
          type: "kyc_approved",
          title: "KYC Approved!",
          body: `Your identity has been verified. You can now trade up to ${verification.tier === "enhanced" ? "$100,000" : "$10,000"} daily.`,
          data: { tier: verification.tier },
          channels: ["push", "in_app", "email"],
        },
      });
    } else if (finalStatus.requiresManualReview) {
      // Create review case
      await step.sendEvent("create-review-case", {
        name: "compliance/review.required",
        data: {
          userId,
          reason: finalStatus.reason,
          inquiryId,
          riskScore: amlScreening.riskScore,
          matchCount: amlScreening.matches.length,
        },
      });

      // Notify user about pending review
      await step.sendEvent("notify-pending", {
        name: "notification/send",
        data: {
          userId,
          type: "kyc_rejected",
          title: "KYC Under Review",
          body: "Your verification is being reviewed by our compliance team. We'll notify you within 1-2 business days.",
          data: { status: "pending_review" },
          channels: ["email", "in_app"],
        },
      });
    } else {
      // KYC rejected
      await step.sendEvent("kyc-rejected", {
        name: "compliance/kyc.rejected",
        data: {
          userId,
          reason: finalStatus.reason,
          rejectedAt: Date.now(),
        },
      });

      await step.sendEvent("notify-rejected", {
        name: "notification/send",
        data: {
          userId,
          type: "kyc_rejected",
          title: "KYC Verification Failed",
          body: "Unfortunately, we couldn't verify your identity. Please contact support for assistance.",
          data: { reason: finalStatus.reason },
          channels: ["push", "in_app", "email"],
        },
      });
    }

    return {
      userId,
      inquiryId,
      approved: finalStatus.approved,
      requiresManualReview: finalStatus.requiresManualReview,
      reason: finalStatus.reason,
      tier: verification.tier,
    };
  }
);

// ============================================================================
// Process Compliance Review Function
// ============================================================================

/**
 * Process manual compliance review decision
 */
export const processComplianceReview = inngest.createFunction(
  {
    id: "pull/compliance/process-review",
    name: "Process Compliance Review",
    retries: DEFAULT_RETRY_CONFIG.attempts,
  },
  { event: "compliance/review.completed" },
  async ({ event, step, logger }) => {
    const { userId, reviewId, decision, reviewedBy, notes } = event.data;

    logger.info("Processing compliance review", { userId, reviewId, decision });

    // Step 1: Update review case
    await step.run("update-review-case", async () => {
      // In production: update in Convex
      // await convex.mutation(api.compliance.updateReviewCase, {
      //   reviewId,
      //   decision,
      //   reviewedBy,
      //   notes,
      //   completedAt: Date.now(),
      // });
    });

    // Step 2: Take action based on decision
    if (decision === "approved") {
      // Approve KYC
      await step.run("approve-kyc", async () => {
        // await convex.mutation(api.compliance.approveKYC, {
        //   userId,
        //   approvedBy: reviewedBy,
        //   notes,
        // });
      });

      await step.sendEvent("notify-approval", {
        name: "notification/send",
        data: {
          userId,
          type: "kyc_approved",
          title: "Verification Complete",
          body: "Your account has been fully verified. You can now access all trading features.",
          data: { reviewId },
          channels: ["push", "in_app", "email"],
        },
      });
    } else if (decision === "rejected") {
      // Reject and potentially restrict account
      await step.run("reject-and-restrict", async () => {
        // await convex.mutation(api.compliance.rejectKYC, {
        //   userId,
        //   rejectedBy: reviewedBy,
        //   reason: notes,
        // });
        //
        // await convex.mutation(api.users.restrictAccount, {
        //   userId,
        //   reason: "compliance_rejection",
        // });
      });

      await step.sendEvent("notify-rejection", {
        name: "notification/send",
        data: {
          userId,
          type: "kyc_rejected",
          title: "Verification Rejected",
          body: "Your account verification was not approved. Please contact support for more information.",
          data: { reviewId },
          channels: ["push", "in_app", "email"],
        },
      });
    } else if (decision === "escalated") {
      // Escalate to senior compliance
      await step.run("escalate-case", async () => {
        // await convex.mutation(api.compliance.escalateCase, {
        //   reviewId,
        //   escalatedBy: reviewedBy,
        //   notes,
        // });
      });

      // Notify senior compliance team
      await step.run("notify-escalation", async () => {
        // await sendSlackNotification(SENIOR_COMPLIANCE_CHANNEL, {
        //   text: `Case ${reviewId} escalated for user ${userId}`,
        //   notes,
        // });
      });
    }

    // Step 3: Log audit trail
    await step.run("log-audit-trail", async () => {
      // In production: insert audit log
      // await convex.mutation(api.compliance.logAuditEvent, {
      //   type: "review_completed",
      //   userId,
      //   reviewId,
      //   decision,
      //   reviewedBy,
      //   timestamp: Date.now(),
      // });
    });

    return {
      userId,
      reviewId,
      decision,
      processedAt: Date.now(),
    };
  }
);

// ============================================================================
// Transaction Monitoring Function
// ============================================================================

/**
 * Monitor transactions for suspicious activity
 * Triggered on high-value or suspicious transactions
 */
export const monitorTransaction = inngest.createFunction(
  {
    id: "pull/compliance/monitor-transaction",
    name: "Monitor Transaction",
    retries: CRITICAL_RETRY_CONFIG.attempts,
    concurrency: {
      limit: 10,
    },
  },
  { event: "trading/order.filled" },
  async ({ event, step, logger }) => {
    const { orderId, userId, amount, ticker, side, price } = event.data;
    const transactionValue = amount * price;

    logger.info("Monitoring transaction", { orderId, userId, transactionValue });

    // Step 1: Check if transaction exceeds thresholds
    const thresholdChecks = await step.run("check-thresholds", async () => {
      return {
        exceedsSingleTransaction: transactionValue >= 10000,
        needsEnhancedDueDiligence: transactionValue >= 50000,
        requiresReporting: transactionValue >= 10000, // CTR threshold
      };
    });

    // Step 2: Get user's transaction history
    const userHistory = await step.run("get-user-history", async () => {
      // In production: fetch from Convex
      // return await convex.query(api.compliance.getUserTransactionHistory, {
      //   userId,
      //   daysBack: 30,
      // });
      return {
        totalVolume30d: 50000,
        transactionCount30d: 25,
        averageSize: 2000,
        largestTransaction: 15000,
        unusualPatterns: [] as string[],
      };
    });

    // Step 3: Run pattern detection
    const patternAnalysis = await step.run("analyze-patterns", async () => {
      const patterns = [];

      // Check for structuring (splitting transactions to avoid reporting)
      if (
        userHistory.transactionCount30d > 20 &&
        userHistory.averageSize >= 8000 &&
        userHistory.averageSize < 10000
      ) {
        patterns.push("potential_structuring");
      }

      // Check for unusual spike in activity
      if (transactionValue > userHistory.largestTransaction * 2) {
        patterns.push("unusual_transaction_size");
      }

      // Check for rapid succession of trades
      if (userHistory.transactionCount30d > 50) {
        patterns.push("high_frequency_trading");
      }

      return {
        patterns,
        riskLevel: patterns.length > 1
          ? "high"
          : patterns.length > 0
            ? "medium"
            : "low",
      };
    });

    // Step 4: Take action based on analysis
    if (patternAnalysis.riskLevel === "high" || thresholdChecks.needsEnhancedDueDiligence) {
      await step.run("create-sar-alert", async () => {
        // In production: create suspicious activity report
        // await convex.mutation(api.compliance.createSARAlert, {
        //   userId,
        //   orderId,
        //   amount: transactionValue,
        //   patterns: patternAnalysis.patterns,
        //   riskLevel: patternAnalysis.riskLevel,
        // });
      });

      await step.sendEvent("compliance-review", {
        name: "compliance/review.required",
        data: {
          userId,
          reason: "suspicious_activity",
          riskScore: patternAnalysis.riskLevel === "high" ? 85 : 65,
          matchCount: patternAnalysis.patterns.length,
        },
      });
    }

    // Step 5: File CTR if required
    if (thresholdChecks.requiresReporting) {
      await step.run("prepare-ctr", async () => {
        // In production: prepare Currency Transaction Report
        // await convex.mutation(api.compliance.prepareCTR, {
        //   userId,
        //   orderId,
        //   amount: transactionValue,
        //   transactionDate: Date.now(),
        // });
      });
    }

    return {
      orderId,
      userId,
      transactionValue,
      thresholdChecks,
      patternAnalysis,
      monitoredAt: Date.now(),
    };
  }
);

// ============================================================================
// Export Functions
// ============================================================================

export const complianceFunctions = [
  periodicKYCCheck,
  processKYCVerification,
  processComplianceReview,
  monitorTransaction,
];
