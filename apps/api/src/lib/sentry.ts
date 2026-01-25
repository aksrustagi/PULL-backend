import * as Sentry from "@sentry/node";
import { getLogger } from "@pull/core/services";

const SENTRY_DSN = process.env.SENTRY_DSN;
const ENVIRONMENT = process.env.NODE_ENV || "development";

export function initSentry() {
  const logger = getLogger();

  if (!SENTRY_DSN) {
    logger.warn("Sentry DSN not configured, error tracking disabled");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    tracesSampleRate: ENVIRONMENT === "production" ? 0.1 : 1.0,
    integrations: [
      // Add any specific integrations
    ],
    beforeSend(event, hint) {
      // Filter out sensitive data
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }
      return event;
    },
  });

  logger.info("Sentry initialized", { environment: ENVIRONMENT });
}

export function captureException(error: Error, context?: Record<string, any>) {
  const logger = getLogger();

  if (!SENTRY_DSN) {
    logger.error("Error captured (Sentry disabled)", { error, ...context });
    return;
  }

  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info") {
  const logger = getLogger();

  if (!SENTRY_DSN) {
    const logLevel = level === "warning" ? "warn" : level;
    logger[logLevel](message, { source: "sentry-fallback" });
    return;
  }

  Sentry.captureMessage(message, level);
}

export function setUser(userId: string, email?: string) {
  Sentry.setUser({ id: userId, email });
}

export function clearUser() {
  Sentry.setUser(null);
}

export { Sentry };
