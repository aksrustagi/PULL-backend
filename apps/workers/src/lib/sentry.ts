import * as Sentry from "@sentry/node";

const SENTRY_DSN = process.env.SENTRY_DSN;
const ENVIRONMENT = process.env.NODE_ENV || "development";

export function initSentry() {
  if (!SENTRY_DSN) {
    console.warn("Sentry DSN not configured, error tracking disabled");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    tracesSampleRate: ENVIRONMENT === "production" ? 0.1 : 1.0,
    integrations: [
      // Add any specific integrations for workers
    ],
    beforeSend(event) {
      // Filter out sensitive data from worker context
      if (event.extra) {
        // Remove any sensitive workflow data
        delete event.extra["apiKey"];
        delete event.extra["secret"];
        delete event.extra["token"];
      }
      return event;
    },
  });

  console.log("Sentry initialized for workers");
}

export function captureException(error: Error, context?: Record<string, any>) {
  if (!SENTRY_DSN) {
    console.error("Worker Error:", error, context);
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag("service", "workers");
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

export function captureWorkflowError(
  error: Error,
  workflowId: string,
  workflowType: string,
  context?: Record<string, any>
) {
  if (!SENTRY_DSN) {
    console.error(`Workflow Error [${workflowType}:${workflowId}]:`, error, context);
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag("service", "workers");
    scope.setTag("workflowType", workflowType);
    scope.setTag("workflowId", workflowId);
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

export function captureActivityError(
  error: Error,
  activityName: string,
  context?: Record<string, any>
) {
  if (!SENTRY_DSN) {
    console.error(`Activity Error [${activityName}]:`, error, context);
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag("service", "workers");
    scope.setTag("activityName", activityName);
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info") {
  if (!SENTRY_DSN) {
    console.log(`[${level}] ${message}`);
    return;
  }

  Sentry.captureMessage(message, level);
}

export { Sentry };
