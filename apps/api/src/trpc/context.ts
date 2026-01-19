import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { verifyToken } from "../middleware/auth";

export interface Context {
  userId?: string;
  requestId: string;
}

export async function createContext(
  opts: FetchCreateContextFnOptions
): Promise<Context> {
  const requestId =
    opts.req.headers.get("X-Request-ID") ?? crypto.randomUUID();

  const authHeader = opts.req.headers.get("Authorization");
  let userId: string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const result = await verifyToken(token);
    userId = result?.userId;
  }

  return {
    userId,
    requestId,
  };
}
