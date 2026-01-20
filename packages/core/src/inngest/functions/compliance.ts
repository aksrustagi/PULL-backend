/**
 * Compliance Inngest Functions
 *
 * Event-driven functions for KYC verification and compliance monitoring.
 */

import { NonRetryableError } from "inngest";
import {
  inngest,
  RETRY_CONFIGS,
  CONCURRENCY_CONFIGS,
  logToDeadLetter,
} from "../client";
import { EVENT_NAMES } from "../events";

// =============================================================================
// Types
// =============================================================================

type KYCStatus =
  | "pending"
  | "verified"
  | "needs_review"
  | "rejected"
  | "expired";

type KYCLevel = "basic" | "standard" | "enhanced";

interface UserKYC {
  id: string;
  userId: string;
  status: KYCStatus;
  level: KYCLevel;
  personaInquiryId?: string;
  verifiedAt?: Date;
  expiresAt?: Date;
  lastScreenedAt?: Date;
  watchlistMatches: WatchlistMatch[];
  documents: KYCDocument[];
  createdAt: Date;
  updatedAt: Date;
}

interface KYCDocument {
  type: "passport" | "drivers_license" | "national_id" | "proof_of_address";
  status: "pending" | "verified" | "rejected";
  verifiedAt?: Date;
  expiresAt?: Date;
}

interface WatchlistMatch {
  id: string;
  matchType: "sanctions" | "pep" | "adverse_media";
  matchScore: number;
  listName: string;
  matchDetails: string;
  status: "pending_review" | "cleared" | "confirmed_match";
  reviewedBy?: string;
  reviewedAt?: Date;
  notes?: string;
}

interface ScreeningResult {
  hasMatches: boolean;
  matches: Array<{
    matchType: WatchlistMatch["matchType"];
    matchScore: number;
    listName: string;
    matchDetails: string;
  }>;
  screenedAt: Date;
}

interface ComplianceAlert {
  id: string;
  userId: string;
  type:
    | "kyc_expiring"
    | "kyc_expired"
    | "watchlist_match"
    | "document_expiring"
    | "re_verification_required";
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "acknowledged" | "resolved";
  details: Record<string, unknown>;
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
}

// =============================================================================
// Service Interfaces
// =============================================================================

interface PersonaService {
  getInquiry(inquiryId: string): Promise<{
    id: string;
    status: string;
    verifications: Array<{
      type: string;
      status: string;
      result?: string;
    }>;
  }>;
}

interface ScreeningService {
  screenUser(params: {
    userId: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    countryOfResidence?: string;
  }): Promise<ScreeningResult>;

  getWatchlists(): Promise<
    Array<{
      id: string;
      name: string;
      type: "sanctions" | "pep" | "adverse_media";
      lastUpdated: Date;
    }>
  >;
}

interface ConvexService {
  // KYC operations
  getAllActiveKYC(): Promise<UserKYC[]>;
  getExpiringKYC(daysThreshold: number): Promise<UserKYC[]>;
  updateKYCStatus(kycId: string, updates: Partial<UserKYC>): Promise<void>;
  addWatchlistMatch(
    kycId: string,
    match: Omit<WatchlistMatch, "id">
  ): Promise<string>;
  clearWatchlistMatch(matchId: string, reviewedBy: string): Promise<void>;

  // User data
  getUserBasicInfo(userId: string): Promise<{
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    countryOfResidence?: string;
  } | null>;

  // Alerts
  createComplianceAlert(
    alert: Omit<ComplianceAlert, "id" | "createdAt" | "status">
  ): Promise<string>;
  getOpenAlerts(userId: string): Promise<ComplianceAlert[]>;
  resolveAlert(alertId: string, resolvedBy: string): Promise<void>;
}

interface NotificationService {
  notifyComplianceTeam(params: {
    alertType: ComplianceAlert["type"];
    severity: ComplianceAlert["severity"];
    userId: string;
    details: Record<string, unknown>;
  }): Promise<void>;

  notifyUser(params: {
    userId: string;
    type: "kyc_expiring" | "kyc_action_required";
    title: string;
    body: string;
  }): Promise<void>;
}

// =============================================================================
// Service Factory
// =============================================================================

interface Services {
  persona: PersonaService;
  screening: ScreeningService;
  convex: ConvexService;
  notifications: NotificationService;
}

function getServices(): Services {
  return {
    persona: {
      async getInquiry() {
        throw new Error("PersonaService not configured");
      },
    },
    screening: {
      async screenUser() {
        throw new Error("ScreeningService not configured");
      },
      async getWatchlists() {
        throw new Error("ScreeningService not configured");
      },
    },
    convex: {
      async getAllActiveKYC() {
        throw new Error("ConvexService not configured");
      },
      async getExpiringKYC() {
        throw new Error("ConvexService not configured");
      },
      async updateKYCStatus() {
        throw new Error("ConvexService not configured");
      },
      async addWatchlistMatch() {
        throw new Error("ConvexService not configured");
      },
      async clearWatchlistMatch() {
        throw new Error("ConvexService not configured");
      },
      async getUserBasicInfo() {
        throw new Error("ConvexService not configured");
      },
      async createComplianceAlert() {
        throw new Error("ConvexService not configured");
      },
      async getOpenAlerts() {
        throw new Error("ConvexService not configured");
      },
      async resolveAlert() {
        throw new Error("ConvexService not configured");
      },
    },
    notifications: {
      async notifyComplianceTeam() {
        throw new Error("NotificationService not configured");
      },
      async notifyUser() {
        throw new Error("NotificationService not configured");
      },
    },
  };
}

let servicesOverride: Services | null = null;

export function setServices(services: Services): void {
  servicesOverride = services;
}

export function clearServices(): void {
  servicesOverride = null;
}

function services(): Services {
  return servicesOverride ?? getServices();
}

// =============================================================================
// Constants
// =============================================================================

const KYC_EXPIRY_WARNING_DAYS = 30; // Warn 30 days before expiry
const KYC_EXPIRY_URGENT_DAYS = 7; // Urgent warning 7 days before expiry
const WATCHLIST_MATCH_THRESHOLD = 0.8; // Minimum score to flag as potential match
const SCREENING_BATCH_SIZE = 100; // Users to screen per batch

// =============================================================================
// periodicKYCCheck Function
// =============================================================================

/**
 * Performs periodic KYC verification and compliance checks.
 *
 * Triggers:
 * - Cron: Weekly on Sunday at midnight
 *
 * Process:
 * 1. Check for expiring KYC verifications
 * 2. Re-screen users against watchlists
 * 3. Flag issues for compliance review
 */
export const periodicKYCCheck = inngest.createFunction(
  {
    id: "periodic-kyc-check",
    name: "Periodic KYC Check",
    retries: RETRY_CONFIGS.critical.attempts, // Critical compliance function
    concurrency: [{ limit: 1 }], // Single instance
    onFailure: async ({ error, event, runId }) => {
      await logToDeadLetter({
        originalEvent: { name: event.name, data: event.data },
        error: {
          message: error.message,
          stack: error.stack,
        },
        functionName: "periodic-kyc-check",
        runId,
        timestamp: new Date().toISOString(),
        attemptCount: RETRY_CONFIGS.critical.attempts,
      });

      // Critical compliance failure - alert immediately
      const { notifications } = services();
      await notifications.notifyComplianceTeam({
        alertType: "kyc_expired",
        severity: "critical",
        userId: "system",
        details: {
          error: error.message,
          failedAt: new Date().toISOString(),
          runId,
        },
      });
    },
  },
  { cron: "0 0 * * 0" }, // Weekly on Sunday at midnight
  async ({ step, logger }) => {
    const { screening, convex, notifications } = services();

    const checkStartTime = new Date();
    const stats = {
      totalChecked: 0,
      expiringKYC: 0,
      expiredKYC: 0,
      watchlistMatches: 0,
      alertsCreated: 0,
      usersNotified: 0,
    };

    // Step 1: Check for expiring KYC
    const expiringKYC = await step.run("check-expiring-kyc", async () => {
      const expiring = await convex.getExpiringKYC(KYC_EXPIRY_WARNING_DAYS);
      return expiring;
    });

    logger.info(`Found ${expiringKYC.length} expiring KYC records`);
    stats.expiringKYC = expiringKYC.length;

    // Step 2: Process expiring KYC
    for (const kyc of expiringKYC) {
      await step.run(`process-expiring-kyc-${kyc.id}`, async () => {
        const now = new Date();
        const expiryDate = kyc.expiresAt!;
        const daysUntilExpiry = Math.ceil(
          (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Determine severity based on days until expiry
        let severity: ComplianceAlert["severity"] = "low";
        if (daysUntilExpiry <= 0) {
          severity = "critical";
          stats.expiredKYC++;

          // Mark as expired
          await convex.updateKYCStatus(kyc.id, {
            status: "expired",
          });
        } else if (daysUntilExpiry <= KYC_EXPIRY_URGENT_DAYS) {
          severity = "high";
        } else if (daysUntilExpiry <= 14) {
          severity = "medium";
        }

        // Check if we already have an open alert
        const existingAlerts = await convex.getOpenAlerts(kyc.userId);
        const hasExistingAlert = existingAlerts.some(
          (a) => a.type === "kyc_expiring" || a.type === "kyc_expired"
        );

        if (!hasExistingAlert) {
          // Create compliance alert
          await convex.createComplianceAlert({
            userId: kyc.userId,
            type: daysUntilExpiry <= 0 ? "kyc_expired" : "kyc_expiring",
            severity,
            details: {
              kycId: kyc.id,
              level: kyc.level,
              expiresAt: expiryDate.toISOString(),
              daysUntilExpiry,
            },
          });
          stats.alertsCreated++;

          // Emit event for downstream processing
          if (daysUntilExpiry > 0) {
            await inngest.send({
              name: EVENT_NAMES.COMPLIANCE_KYC_EXPIRING,
              data: {
                userId: kyc.userId,
                kycId: kyc.id,
                expirationDate: expiryDate.toISOString(),
                daysUntilExpiration: daysUntilExpiry,
                kycLevel: kyc.level,
              },
            });
          }

          // Notify user
          await notifications.notifyUser({
            userId: kyc.userId,
            type: "kyc_expiring",
            title:
              daysUntilExpiry <= 0
                ? "Your verification has expired"
                : "Your verification is expiring soon",
            body:
              daysUntilExpiry <= 0
                ? "Please complete re-verification to continue using PULL."
                : `Your identity verification expires in ${daysUntilExpiry} days. Please renew it to avoid service interruption.`,
          });
          stats.usersNotified++;
        }

        // Notify compliance team for critical issues
        if (severity === "critical" || severity === "high") {
          await notifications.notifyComplianceTeam({
            alertType: daysUntilExpiry <= 0 ? "kyc_expired" : "kyc_expiring",
            severity,
            userId: kyc.userId,
            details: {
              kycId: kyc.id,
              level: kyc.level,
              daysUntilExpiry,
            },
          });
        }
      });
    }

    // Step 3: Get all active KYC for watchlist screening
    const activeKYC = await step.run("get-active-kyc", async () => {
      return convex.getAllActiveKYC();
    });

    logger.info(`Screening ${activeKYC.length} users against watchlists`);
    stats.totalChecked = activeKYC.length;

    // Step 4: Screen users in batches
    const batches = [];
    for (let i = 0; i < activeKYC.length; i += SCREENING_BATCH_SIZE) {
      batches.push(activeKYC.slice(i, i + SCREENING_BATCH_SIZE));
    }

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      await step.run(`screen-batch-${i}`, async () => {
        for (const kyc of batch) {
          try {
            // Get user info for screening
            const userInfo = await convex.getUserBasicInfo(kyc.userId);

            if (!userInfo) {
              logger.warn(`No user info for ${kyc.userId}, skipping screening`);
              continue;
            }

            // Perform screening
            const screeningResult = await screening.screenUser({
              userId: kyc.userId,
              firstName: userInfo.firstName,
              lastName: userInfo.lastName,
              dateOfBirth: userInfo.dateOfBirth,
              countryOfResidence: userInfo.countryOfResidence,
            });

            // Update last screened timestamp
            await convex.updateKYCStatus(kyc.id, {
              lastScreenedAt: screeningResult.screenedAt,
            });

            // Process matches
            if (screeningResult.hasMatches) {
              for (const match of screeningResult.matches) {
                // Only flag significant matches
                if (match.matchScore >= WATCHLIST_MATCH_THRESHOLD) {
                  stats.watchlistMatches++;

                  // Add match to KYC record
                  const matchId = await convex.addWatchlistMatch(kyc.id, {
                    matchType: match.matchType,
                    matchScore: match.matchScore,
                    listName: match.listName,
                    matchDetails: match.matchDetails,
                    status: "pending_review",
                  });

                  // Determine severity
                  const severity =
                    match.matchType === "sanctions"
                      ? "critical"
                      : match.matchScore >= 0.95
                        ? "high"
                        : "medium";

                  // Create compliance alert
                  await convex.createComplianceAlert({
                    userId: kyc.userId,
                    type: "watchlist_match",
                    severity,
                    details: {
                      kycId: kyc.id,
                      matchId,
                      matchType: match.matchType,
                      matchScore: match.matchScore,
                      listName: match.listName,
                    },
                  });
                  stats.alertsCreated++;

                  // Emit event
                  await inngest.send({
                    name: EVENT_NAMES.COMPLIANCE_WATCHLIST_MATCH,
                    data: {
                      userId: kyc.userId,
                      matchType: match.matchType,
                      matchScore: match.matchScore,
                      matchDetails: match.matchDetails,
                      requiresReview: true,
                    },
                  });

                  // Notify compliance team
                  await notifications.notifyComplianceTeam({
                    alertType: "watchlist_match",
                    severity,
                    userId: kyc.userId,
                    details: {
                      matchType: match.matchType,
                      matchScore: match.matchScore,
                      listName: match.listName,
                      matchDetails: match.matchDetails,
                    },
                  });
                }
              }
            }
          } catch (err) {
            logger.error(
              `Failed to screen user ${kyc.userId}: ${(err as Error).message}`
            );
            // Continue with next user - don't fail the entire batch
          }
        }
      });

      // Add delay between batches to avoid rate limiting
      if (i < batches.length - 1) {
        await step.sleep("batch-delay", "2s");
      }
    }

    // Step 5: Check for expiring documents
    await step.run("check-expiring-documents", async () => {
      const now = new Date();
      const thirtyDaysFromNow = new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000
      );

      for (const kyc of activeKYC) {
        for (const doc of kyc.documents) {
          if (
            doc.expiresAt &&
            doc.status === "verified" &&
            new Date(doc.expiresAt) <= thirtyDaysFromNow
          ) {
            const daysUntilExpiry = Math.ceil(
              (new Date(doc.expiresAt).getTime() - now.getTime()) /
                (1000 * 60 * 60 * 24)
            );

            // Check for existing alert
            const existingAlerts = await convex.getOpenAlerts(kyc.userId);
            const hasAlert = existingAlerts.some(
              (a) =>
                a.type === "document_expiring" &&
                (a.details as Record<string, unknown>).documentType === doc.type
            );

            if (!hasAlert && daysUntilExpiry > 0) {
              await convex.createComplianceAlert({
                userId: kyc.userId,
                type: "document_expiring",
                severity: daysUntilExpiry <= 7 ? "high" : "medium",
                details: {
                  kycId: kyc.id,
                  documentType: doc.type,
                  expiresAt: doc.expiresAt,
                  daysUntilExpiry,
                },
              });
              stats.alertsCreated++;

              await notifications.notifyUser({
                userId: kyc.userId,
                type: "kyc_action_required",
                title: "Document expiring soon",
                body: `Your ${doc.type.replace(/_/g, " ")} expires in ${daysUntilExpiry} days. Please update it to maintain your verification status.`,
              });
              stats.usersNotified++;
            }
          }
        }
      }
    });

    const checkDuration = Date.now() - checkStartTime.getTime();

    logger.info(
      `KYC check complete: ${stats.totalChecked} checked, ${stats.watchlistMatches} matches, ${stats.alertsCreated} alerts`
    );

    return {
      ...stats,
      checkDuration,
      completedAt: new Date().toISOString(),
    };
  }
);

// =============================================================================
// Exports
// =============================================================================

export const complianceFunctions = [periodicKYCCheck];
