/**
 * Security Headers Middleware
 * Production hardening for API security
 */

import { MiddlewareHandler } from "hono";

export interface SecurityConfig {
  // Content Security Policy
  contentSecurityPolicy?: string | false;

  // Cross-Origin settings
  crossOriginEmbedderPolicy?: string | false;
  crossOriginOpenerPolicy?: string | false;
  crossOriginResourcePolicy?: string | false;

  // Other security headers
  dnsPrefetchControl?: boolean;
  frameguard?: "deny" | "sameorigin" | false;
  hsts?: {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  } | false;
  ieNoOpen?: boolean;
  noSniff?: boolean;
  originAgentCluster?: boolean;
  permittedCrossDomainPolicies?: string | false;
  referrerPolicy?: string | false;
  xssFilter?: boolean;

  // CORS settings
  cors?: {
    origins?: string[];
    methods?: string[];
    allowedHeaders?: string[];
    exposedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
  };
}

const defaultConfig: SecurityConfig = {
  contentSecurityPolicy: "default-src 'self'",
  crossOriginEmbedderPolicy: "require-corp",
  crossOriginOpenerPolicy: "same-origin",
  crossOriginResourcePolicy: "same-origin",
  dnsPrefetchControl: true,
  frameguard: "deny",
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: "none",
  referrerPolicy: "strict-origin-when-cross-origin",
  xssFilter: true,
};

/**
 * Security headers middleware
 */
export function securityHeaders(config: SecurityConfig = {}): MiddlewareHandler {
  const mergedConfig = { ...defaultConfig, ...config };

  return async (c, next) => {
    // Content-Security-Policy
    if (mergedConfig.contentSecurityPolicy) {
      c.header("Content-Security-Policy", mergedConfig.contentSecurityPolicy);
    }

    // Cross-Origin-Embedder-Policy
    if (mergedConfig.crossOriginEmbedderPolicy) {
      c.header("Cross-Origin-Embedder-Policy", mergedConfig.crossOriginEmbedderPolicy);
    }

    // Cross-Origin-Opener-Policy
    if (mergedConfig.crossOriginOpenerPolicy) {
      c.header("Cross-Origin-Opener-Policy", mergedConfig.crossOriginOpenerPolicy);
    }

    // Cross-Origin-Resource-Policy
    if (mergedConfig.crossOriginResourcePolicy) {
      c.header("Cross-Origin-Resource-Policy", mergedConfig.crossOriginResourcePolicy);
    }

    // X-DNS-Prefetch-Control
    if (mergedConfig.dnsPrefetchControl) {
      c.header("X-DNS-Prefetch-Control", "off");
    }

    // X-Frame-Options
    if (mergedConfig.frameguard) {
      c.header("X-Frame-Options", mergedConfig.frameguard.toUpperCase());
    }

    // Strict-Transport-Security
    if (mergedConfig.hsts) {
      let hstsValue = `max-age=${mergedConfig.hsts.maxAge}`;
      if (mergedConfig.hsts.includeSubDomains) {
        hstsValue += "; includeSubDomains";
      }
      if (mergedConfig.hsts.preload) {
        hstsValue += "; preload";
      }
      c.header("Strict-Transport-Security", hstsValue);
    }

    // X-Download-Options (IE)
    if (mergedConfig.ieNoOpen) {
      c.header("X-Download-Options", "noopen");
    }

    // X-Content-Type-Options
    if (mergedConfig.noSniff) {
      c.header("X-Content-Type-Options", "nosniff");
    }

    // Origin-Agent-Cluster
    if (mergedConfig.originAgentCluster) {
      c.header("Origin-Agent-Cluster", "?1");
    }

    // X-Permitted-Cross-Domain-Policies
    if (mergedConfig.permittedCrossDomainPolicies) {
      c.header("X-Permitted-Cross-Domain-Policies", mergedConfig.permittedCrossDomainPolicies);
    }

    // Referrer-Policy
    if (mergedConfig.referrerPolicy) {
      c.header("Referrer-Policy", mergedConfig.referrerPolicy);
    }

    // X-XSS-Protection
    if (mergedConfig.xssFilter) {
      c.header("X-XSS-Protection", "1; mode=block");
    }

    // Remove potentially dangerous headers
    c.header("X-Powered-By", ""); // Remove framework identifier

    await next();
  };
}

/**
 * CORS middleware with security defaults
 */
export function cors(config?: SecurityConfig["cors"]): MiddlewareHandler {
  const {
    origins = [],
    methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders = ["Content-Type", "Authorization", "X-Requested-With", "X-Correlation-ID"],
    exposedHeaders = ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    credentials = true,
    maxAge = 86400, // 24 hours
  } = config || {};

  return async (c, next) => {
    const origin = c.req.header("origin");

    // Check if origin is allowed
    const isAllowed =
      origins.length === 0 || // Allow all if no origins specified
      origins.includes("*") ||
      (origin && origins.includes(origin));

    if (isAllowed && origin) {
      c.header("Access-Control-Allow-Origin", origin);
    }

    if (credentials) {
      c.header("Access-Control-Allow-Credentials", "true");
    }

    // Handle preflight requests
    if (c.req.method === "OPTIONS") {
      c.header("Access-Control-Allow-Methods", methods.join(", "));
      c.header("Access-Control-Allow-Headers", allowedHeaders.join(", "));
      c.header("Access-Control-Max-Age", String(maxAge));

      return c.text("", 204);
    }

    // Set exposed headers for actual requests
    c.header("Access-Control-Expose-Headers", exposedHeaders.join(", "));

    await next();
  };
}

/**
 * API-specific security preset (less restrictive CSP for API)
 */
export function apiSecurityHeaders(): MiddlewareHandler {
  return securityHeaders({
    contentSecurityPolicy: false, // APIs don't serve HTML
    crossOriginEmbedderPolicy: false, // Not needed for APIs
    crossOriginOpenerPolicy: false, // Not needed for APIs
    crossOriginResourcePolicy: "cross-origin", // Allow cross-origin API access
    frameguard: "deny",
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    referrerPolicy: "no-referrer",
    xssFilter: true,
  });
}

/**
 * Request ID middleware for tracing
 */
export function requestId(): MiddlewareHandler {
  return async (c, next) => {
    const existingId = c.req.header("x-request-id") || c.req.header("x-correlation-id");
    const requestId = existingId || crypto.randomUUID();

    c.set("requestId", requestId);
    c.header("X-Request-ID", requestId);

    await next();
  };
}

/**
 * Timing headers (for debugging/monitoring)
 */
export function serverTiming(): MiddlewareHandler {
  return async (c, next) => {
    const start = performance.now();

    await next();

    const duration = performance.now() - start;
    c.header("Server-Timing", `total;dur=${duration.toFixed(2)}`);
  };
}

/**
 * Production security bundle - all recommended settings
 */
export function productionSecurity(allowedOrigins: string[]): MiddlewareHandler[] {
  return [
    requestId(),
    serverTiming(),
    apiSecurityHeaders(),
    cors({
      origins: allowedOrigins,
      credentials: true,
    }),
  ];
}
