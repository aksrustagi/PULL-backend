/**
 * WebSocket Authentication
 * Handles authentication for WebSocket connections
 */

import * as jose from "jose";

// ============================================================================
// Types
// ============================================================================

export interface WebSocketAuthResult {
  authenticated: boolean;
  userId?: string;
  error?: string;
  permissions?: WebSocketPermissions;
}

export interface WebSocketPermissions {
  canSubscribePublic: boolean;
  canSubscribePrivate: boolean;
  canSubscribeAdmin: boolean;
  subscribedMarkets?: string[];
  maxSubscriptions: number;
}

export interface AuthenticatedUser {
  userId: string;
  permissions: WebSocketPermissions;
  authenticatedAt: number;
  expiresAt: number;
}

// ============================================================================
// Configuration
// ============================================================================

const jwtSecretValue = process.env.JWT_SECRET;
if (!jwtSecretValue) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET = new TextEncoder().encode(jwtSecretValue);

const DEFAULT_PERMISSIONS: WebSocketPermissions = {
  canSubscribePublic: true,
  canSubscribePrivate: false,
  canSubscribeAdmin: false,
  maxSubscriptions: 10,
};

const AUTHENTICATED_PERMISSIONS: WebSocketPermissions = {
  canSubscribePublic: true,
  canSubscribePrivate: true,
  canSubscribeAdmin: false,
  maxSubscriptions: 50,
};

const ADMIN_PERMISSIONS: WebSocketPermissions = {
  canSubscribePublic: true,
  canSubscribePrivate: true,
  canSubscribeAdmin: true,
  maxSubscriptions: 1000,
};

// ============================================================================
// Authentication Functions
// ============================================================================

/**
 * Authenticate a WebSocket connection using JWT token
 */
export async function authenticateWebSocket(
  token: string | null | undefined
): Promise<WebSocketAuthResult> {
  // Allow anonymous connections with limited permissions
  if (!token) {
    return {
      authenticated: false,
      permissions: DEFAULT_PERMISSIONS,
    };
  }

  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (!payload.sub) {
      return {
        authenticated: false,
        error: "Invalid token: missing subject",
        permissions: DEFAULT_PERMISSIONS,
      };
    }

    // Determine permissions based on token claims
    const isAdmin = payload.role === "admin";
    const permissions = isAdmin ? ADMIN_PERMISSIONS : AUTHENTICATED_PERMISSIONS;

    return {
      authenticated: true,
      userId: payload.sub,
      permissions,
    };
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      return {
        authenticated: false,
        error: "Token expired",
        permissions: DEFAULT_PERMISSIONS,
      };
    }

    return {
      authenticated: false,
      error: "Invalid token",
      permissions: DEFAULT_PERMISSIONS,
    };
  }
}

/**
 * Authenticate from URL query parameter
 */
export async function authenticateFromQuery(
  url: URL
): Promise<WebSocketAuthResult> {
  const token = url.searchParams.get("token");
  return authenticateWebSocket(token);
}

/**
 * Authenticate from protocol header (Sec-WebSocket-Protocol)
 */
export async function authenticateFromProtocol(
  protocols: string | string[] | undefined
): Promise<WebSocketAuthResult> {
  if (!protocols) {
    return authenticateWebSocket(null);
  }

  const protocolArray = Array.isArray(protocols) ? protocols : [protocols];

  // Look for auth token in protocols
  for (const protocol of protocolArray) {
    if (protocol.startsWith("auth.")) {
      const token = protocol.substring(5);
      return authenticateWebSocket(token);
    }
  }

  return authenticateWebSocket(null);
}

/**
 * Re-authenticate an existing connection (for token refresh)
 */
export async function reauthenticate(
  currentUser: AuthenticatedUser | null,
  newToken: string
): Promise<WebSocketAuthResult> {
  const result = await authenticateWebSocket(newToken);

  // Ensure the user ID matches if already authenticated
  if (currentUser && result.authenticated && result.userId !== currentUser.userId) {
    return {
      authenticated: false,
      error: "Cannot change user on existing connection",
      permissions: DEFAULT_PERMISSIONS,
    };
  }

  return result;
}

// ============================================================================
// Permission Checking
// ============================================================================

/**
 * Check if user can subscribe to a channel
 */
export function canSubscribeToChannel(
  permissions: WebSocketPermissions,
  channel: string
): boolean {
  // Admin channels
  if (channel.startsWith("admin:")) {
    return permissions.canSubscribeAdmin;
  }

  // Private user channels
  if (channel.startsWith("user:") || channel.startsWith("private:")) {
    return permissions.canSubscribePrivate;
  }

  // Order/fill channels (user-specific)
  if (channel.startsWith("order:") || channel.startsWith("fill:")) {
    return permissions.canSubscribePrivate;
  }

  // Public channels
  return permissions.canSubscribePublic;
}

/**
 * Check if user can subscribe to a market-specific channel
 */
export function canSubscribeToMarket(
  permissions: WebSocketPermissions,
  marketId: string,
  userId?: string
): boolean {
  // If specific markets are allowed, check the list
  if (permissions.subscribedMarkets) {
    return permissions.subscribedMarkets.includes(marketId);
  }

  // Otherwise, allow based on public subscription permission
  return permissions.canSubscribePublic;
}

/**
 * Check if user has room for more subscriptions
 */
export function canAddSubscription(
  permissions: WebSocketPermissions,
  currentCount: number
): boolean {
  return currentCount < permissions.maxSubscriptions;
}

// ============================================================================
// Token Validation
// ============================================================================

/**
 * Validate token without full authentication (quick check)
 */
export async function validateToken(token: string): Promise<boolean> {
  try {
    await jose.jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract user ID from token without full validation
 */
export async function extractUserId(token: string): Promise<string | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/**
 * Get token expiration time
 */
export async function getTokenExpiration(token: string): Promise<number | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// ============================================================================
// Connection State
// ============================================================================

/**
 * Create authenticated user state
 */
export function createAuthenticatedUser(
  result: WebSocketAuthResult
): AuthenticatedUser | null {
  if (!result.authenticated || !result.userId || !result.permissions) {
    return null;
  }

  return {
    userId: result.userId,
    permissions: result.permissions,
    authenticatedAt: Date.now(),
    expiresAt: Date.now() + 3600000, // 1 hour default
  };
}

/**
 * Check if authenticated user session is still valid
 */
export function isSessionValid(user: AuthenticatedUser): boolean {
  return Date.now() < user.expiresAt;
}

/**
 * Update session expiration
 */
export function extendSession(
  user: AuthenticatedUser,
  extensionMs: number = 3600000
): AuthenticatedUser {
  return {
    ...user,
    expiresAt: Date.now() + extensionMs,
  };
}

export default {
  authenticateWebSocket,
  authenticateFromQuery,
  authenticateFromProtocol,
  reauthenticate,
  canSubscribeToChannel,
  canSubscribeToMarket,
  canAddSubscription,
  validateToken,
  extractUserId,
  getTokenExpiration,
  createAuthenticatedUser,
  isSessionValid,
  extendSession,
};
