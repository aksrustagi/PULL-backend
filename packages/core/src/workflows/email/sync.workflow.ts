/**
 * Email Sync Workflow
 * Syncs emails from Nylas and processes them with AI triage
 */

import {
  proxyActivities,
  defineQuery,
  setHandler,
  continueAsNew,
  sleep,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  fetchNylasMessages,
  checkEmailProcessed,
  triageWithClaude,
  storeEmailConvex,
  detectTradingSignals,
  linkToAssets,
  updateSyncCursor,
  createUrgentAlert,
  recordAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1 second",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Extended timeout for AI triage
const { triageEmailBatch } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  heartbeatTimeout: "30 seconds",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Workflow input type
export interface EmailSyncInput {
  userId: string;
  grantId: string;
  syncCursor?: string;
  isInitialSync?: boolean;
}

// Sync status type
export interface EmailSyncStatus {
  syncId: string;
  status: "syncing" | "processing" | "completed" | "failed";
  emailsFetched: number;
  emailsProcessed: number;
  emailsTriaged: number;
  urgentAlertsCreated: number;
  tradingSignalsDetected: number;
  lastSyncCursor?: string;
  lastProcessedAt?: string;
  errors: Array<{ emailId: string; error: string }>;
}

// Configuration
const BATCH_SIZE = 50;
const SYNC_INTERVAL_MINUTES = 5;

// Queries
export const getSyncStatusQuery = defineQuery<EmailSyncStatus>("getSyncStatus");

/**
 * Email Sync Workflow
 */
export async function emailSyncWorkflow(
  input: EmailSyncInput
): Promise<EmailSyncStatus> {
  const { userId, grantId, syncCursor, isInitialSync } = input;

  // Generate sync ID
  const syncId = `sync_${Date.now()}`;

  // Initialize status
  const status: EmailSyncStatus = {
    syncId,
    status: "syncing",
    emailsFetched: 0,
    emailsProcessed: 0,
    emailsTriaged: 0,
    urgentAlertsCreated: 0,
    tradingSignalsDetected: 0,
    lastSyncCursor: syncCursor,
    errors: [],
  };

  // Set up query handler
  setHandler(getSyncStatusQuery, () => status);

  try {
    // Log sync start
    await recordAuditLog({
      userId,
      action: "email_sync_started",
      resourceType: "email_sync",
      resourceId: syncId,
      metadata: { grantId, isInitialSync },
    });

    // =========================================================================
    // Step 1: Fetch new emails from Nylas
    // =========================================================================
    let currentCursor = syncCursor;
    let hasMore = true;

    while (hasMore) {
      const fetchResult = await fetchNylasMessages({
        grantId,
        cursor: currentCursor,
        limit: BATCH_SIZE,
      });

      status.emailsFetched += fetchResult.messages.length;

      if (fetchResult.messages.length === 0) {
        hasMore = false;
        continue;
      }

      // =========================================================================
      // Step 2: Process each email
      // =========================================================================
      status.status = "processing";

      const emailsToTriage: Array<{
        emailId: string;
        messageId: string;
        subject: string;
        body: string;
        from: string;
        to: string[];
        receivedAt: string;
      }> = [];

      for (const message of fetchResult.messages) {
        try {
          // Check if already processed
          const processed = await checkEmailProcessed(message.id);
          if (processed) {
            status.emailsProcessed++;
            continue;
          }

          // Add to triage batch
          emailsToTriage.push({
            emailId: `email_${message.id}`,
            messageId: message.id,
            subject: message.subject ?? "",
            body: message.body ?? "",
            from: message.from?.[0]?.email ?? "",
            to: message.to?.map((t: { email: string }) => t.email) ?? [],
            receivedAt: new Date(message.date * 1000).toISOString(),
          });

          status.emailsProcessed++;
        } catch (error) {
          status.errors.push({
            emailId: message.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // =========================================================================
      // Step 3: Batch triage with Claude
      // =========================================================================
      if (emailsToTriage.length > 0) {
        const triageResults = await triageEmailBatch(emailsToTriage);

        for (const result of triageResults) {
          try {
            // Store in Convex with triage results
            await storeEmailConvex({
              userId,
              emailId: result.emailId,
              messageId: result.messageId,
              subject: result.subject,
              body: result.body,
              from: result.from,
              to: result.to,
              receivedAt: result.receivedAt,
              triage: result.triage,
            });

            status.emailsTriaged++;

            // Create urgent alert if needed
            if (result.triage.priority === "urgent") {
              await createUrgentAlert({
                userId,
                emailId: result.emailId,
                subject: result.subject,
                summary: result.triage.summary,
                suggestedAction: result.triage.suggestedAction,
              });
              status.urgentAlertsCreated++;
            }

            // Detect trading signals
            if (result.triage.relatedTickers?.length > 0) {
              const signals = await detectTradingSignals(
                userId,
                result.emailId,
                result.triage.relatedTickers
              );

              if (signals.detected) {
                status.tradingSignalsDetected++;

                // Link email to relevant assets
                await linkToAssets(result.emailId, signals.assets);
              }
            }
          } catch (error) {
            status.errors.push({
              emailId: result.emailId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // Update cursor for next batch
      currentCursor = fetchResult.nextCursor;
      status.lastSyncCursor = currentCursor;
      hasMore = !!fetchResult.nextCursor && fetchResult.messages.length === BATCH_SIZE;

      // Save cursor progress
      await updateSyncCursor(userId, grantId, currentCursor);
    }

    // =========================================================================
    // Step 4: Finalize
    // =========================================================================
    status.status = "completed";
    status.lastProcessedAt = new Date().toISOString();

    await recordAuditLog({
      userId,
      action: "email_sync_completed",
      resourceType: "email_sync",
      resourceId: syncId,
      metadata: {
        emailsFetched: status.emailsFetched,
        emailsTriaged: status.emailsTriaged,
        urgentAlerts: status.urgentAlertsCreated,
        tradingSignals: status.tradingSignalsDetected,
        errors: status.errors.length,
      },
    });

    // =========================================================================
    // Step 5: Schedule next sync (continue as new)
    // =========================================================================
    if (!isInitialSync) {
      await sleep(`${SYNC_INTERVAL_MINUTES} minutes`);

      await continueAsNew<typeof emailSyncWorkflow>({
        userId,
        grantId,
        syncCursor: status.lastSyncCursor,
        isInitialSync: false,
      });
    }

    return status;
  } catch (error) {
    status.status = "failed";

    await recordAuditLog({
      userId,
      action: "email_sync_failed",
      resourceType: "email_sync",
      resourceId: syncId,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}
