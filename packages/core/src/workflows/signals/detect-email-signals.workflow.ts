/**
 * Detect Email Signals Workflow
 * Triggered on email sync to extract trading signals from email content
 */

import {
  proxyActivities,
  defineQuery,
  defineSignal,
  setHandler,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies with extended timeout for AI processing
const {
  extractEmailSignals,
  storeSignal,
  sendSignalAlert,
  recordSignalAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 seconds",
  heartbeatTimeout: "30 seconds",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Workflow input type
export interface DetectEmailSignalsInput {
  userId: string;
  emails: Array<{
    emailId: string;
    subject: string;
    body: string;
    from: string;
    triageData?: {
      priority: string;
      category: string;
      relatedTickers: string[];
    };
  }>;
}

// Workflow status type
export interface DetectEmailSignalsStatus {
  workflowId: string;
  status: "processing" | "completed" | "failed";
  emailsProcessed: number;
  signalsDetected: number;
  signalIds: string[];
  errors: Array<{ emailId: string; error: string }>;
}

// Queries
export const getStatusQuery = defineQuery<DetectEmailSignalsStatus>("getStatus");

// Signals for external control
export const cancelSignal = defineSignal("cancel");

/**
 * Detect Email Signals Workflow
 * Processes a batch of emails to detect trading-relevant signals
 */
export async function detectEmailSignalsWorkflow(
  input: DetectEmailSignalsInput
): Promise<DetectEmailSignalsStatus> {
  const { userId, emails } = input;

  const workflowId = `email_signals_${Date.now()}`;

  // Initialize status
  const status: DetectEmailSignalsStatus = {
    workflowId,
    status: "processing",
    emailsProcessed: 0,
    signalsDetected: 0,
    signalIds: [],
    errors: [],
  };

  let cancelled = false;

  // Set up handlers
  setHandler(getStatusQuery, () => status);
  setHandler(cancelSignal, () => {
    cancelled = true;
  });

  try {
    await recordSignalAuditLog({
      action: "email_signal_detection_started",
      signalId: workflowId,
      signalType: "email",
      metadata: { userId, emailCount: emails.length },
    });

    // Process each email for signals
    for (const email of emails) {
      if (cancelled) {
        status.status = "completed";
        break;
      }

      try {
        // Extract signals using Claude AI
        const signal = await extractEmailSignals({
          emailId: email.emailId,
          subject: email.subject,
          body: email.body,
          from: email.from,
          triageData: email.triageData,
        });

        status.emailsProcessed++;

        // If a signal was detected, store and potentially alert
        if (signal) {
          const signalId = await storeSignal(signal);
          status.signalsDetected++;
          status.signalIds.push(signalId);

          // Send alert for high/critical severity signals
          if (signal.severity === "high" || signal.severity === "critical") {
            await sendSignalAlert({
              userId,
              signalId,
              title: signal.title,
              severity: signal.severity,
            });
          }

          await recordSignalAuditLog({
            action: "email_signal_detected",
            signalId,
            signalType: "email",
            metadata: {
              emailId: email.emailId,
              severity: signal.severity,
              confidence: signal.confidence,
              markets: signal.relatedMarkets,
            },
          });
        }
      } catch (error) {
        status.errors.push({
          emailId: email.emailId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    status.status = "completed";

    await recordSignalAuditLog({
      action: "email_signal_detection_completed",
      signalId: workflowId,
      signalType: "email",
      metadata: {
        emailsProcessed: status.emailsProcessed,
        signalsDetected: status.signalsDetected,
        errors: status.errors.length,
      },
    });

    return status;
  } catch (error) {
    status.status = "failed";

    await recordSignalAuditLog({
      action: "email_signal_detection_failed",
      signalId: workflowId,
      signalType: "email",
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}
