import { createMiddleware } from "hono/factory";
import type { Env } from "../index";
import { captureException } from "../lib/sentry";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errorHandler = createMiddleware<Env>(async (c, next) => {
  try {
    await next();
  } catch (error) {
    const requestId = c.get("requestId") || crypto.randomUUID();

    // Log error
    console.error(`[${requestId}] Error:`, error);

    // Send to Sentry for error tracking
    captureException(error as Error, {
      requestId,
      path: c.req.path,
      method: c.req.method,
    });

    if (error instanceof AppError) {
      return c.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: process.env.NODE_ENV === "development" ? error.details : undefined,
          },
          requestId,
          timestamp: new Date().toISOString(),
        },
        error.statusCode
      );
    }

    // Generic error response
    return c.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: process.env.NODE_ENV === "production"
            ? "An unexpected error occurred"
            : (error instanceof Error ? error.message : "Unknown error"),
        },
        requestId,
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});
