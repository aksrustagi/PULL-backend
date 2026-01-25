import type { Context, Next } from "hono";
import { captureException, setUser, clearUser } from "../lib/sentry";

export async function sentryMiddleware(c: Context, next: Next) {
  const userId = c.get("userId");

  if (userId) {
    setUser(userId);
  }

  try {
    await next();
  } catch (error) {
    captureException(error as Error, {
      requestId: c.get("requestId"),
      path: c.req.path,
      method: c.req.method,
      userId,
    });
    throw error;
  } finally {
    clearUser();
  }
}
