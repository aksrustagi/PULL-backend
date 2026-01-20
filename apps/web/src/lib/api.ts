/**
 * API Client
 * Type-safe fetch wrapper with auth handling
 */

import { useAuthStore } from "./auth";

// ============================================================================
// Types
// ============================================================================

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: ApiError;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface RequestConfig extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
}

// ============================================================================
// API Client Class
// ============================================================================

class ApiClient {
  private baseUrl: string;
  private defaultHeaders: HeadersInit;

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_API_URL || "/api";
    this.defaultHeaders = {
      "Content-Type": "application/json",
    };
  }

  private getAuthToken(): string | null {
    if (typeof window === "undefined") return null;
    return useAuthStore.getState().token;
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`, window.location.origin);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: response.statusText,
      }));

      // Handle 401 - try to refresh token
      if (response.status === 401) {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (refreshToken) {
          // Token refresh logic would go here
          // For now, just logout
          useAuthStore.getState().logout();
        }
      }

      throw new ApiClientError(
        error.message || "An error occurred",
        response.status,
        error.code,
        error.details
      );
    }

    // Handle empty responses
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return {} as T;
    }

    return response.json();
  }

  async request<T>(
    method: string,
    path: string,
    config: RequestConfig = {}
  ): Promise<T> {
    const { params, timeout = 30000, ...fetchConfig } = config;

    const token = this.getAuthToken();
    const headers = {
      ...this.defaultHeaders,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...fetchConfig.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.buildUrl(path, params), {
        method,
        ...fetchConfig,
        headers,
        signal: controller.signal,
      });

      return this.handleResponse<T>(response);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async get<T>(path: string, config?: RequestConfig): Promise<T> {
    return this.request<T>("GET", path, config);
  }

  async post<T>(path: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>("POST", path, {
      ...config,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(path: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>("PUT", path, {
      ...config,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(path: string, data?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>("PATCH", path, {
      ...config,
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(path: string, config?: RequestConfig): Promise<T> {
    return this.request<T>("DELETE", path, config);
  }
}

// ============================================================================
// Custom Error Class
// ============================================================================

export class ApiClientError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ============================================================================
// API Instance
// ============================================================================

export const api = new ApiClient();

// ============================================================================
// React Query Helpers
// ============================================================================

export function createQueryKey(
  base: string,
  params?: Record<string, unknown>
): (string | Record<string, unknown>)[] {
  return params ? [base, params] : [base];
}

// ============================================================================
// Type-safe API Endpoints
// ============================================================================

export const endpoints = {
  // Auth
  auth: {
    login: "/auth/login",
    register: "/auth/register",
    logout: "/auth/logout",
    refresh: "/auth/refresh",
    me: "/auth/me",
    verifyEmail: "/auth/verify-email",
    forgotPassword: "/auth/forgot-password",
    resetPassword: "/auth/reset-password",
  },

  // Trading
  trading: {
    markets: "/trading/markets",
    market: (ticker: string) => `/trading/markets/${ticker}`,
    orderbook: (ticker: string) => `/trading/markets/${ticker}/orderbook`,
    orders: "/trading/orders",
    order: (id: string) => `/trading/orders/${id}`,
    positions: "/trading/positions",
    portfolio: "/trading/portfolio",
    buyingPower: "/trading/buying-power",
    trades: "/trading/trades",
  },

  // Predictions
  predictions: {
    events: "/predictions/events",
    event: (id: string) => `/predictions/events/${id}`,
    markets: (eventId: string) => `/predictions/events/${eventId}/markets`,
    positions: "/predictions/positions",
    leaderboard: "/predictions/leaderboard",
  },

  // RWA
  rwa: {
    assets: "/rwa/assets",
    asset: (id: string) => `/rwa/assets/${id}`,
    listings: "/rwa/listings",
    listing: (id: string) => `/rwa/listings/${id}`,
    purchase: "/rwa/purchase",
    collection: "/rwa/collection",
  },

  // Rewards
  rewards: {
    balance: "/rewards/balance",
    transactions: "/rewards/transactions",
    catalog: "/rewards/catalog",
    redeem: "/rewards/redeem",
    leaderboard: "/rewards/leaderboard",
    convert: "/rewards/convert",
  },

  // Email
  email: {
    inbox: "/email/inbox",
    email: (id: string) => `/email/${id}`,
    triage: (id: string) => `/email/${id}/triage`,
    smartReply: (id: string) => `/email/${id}/smart-reply`,
    send: "/email/send",
    accounts: "/email/accounts",
  },

  // Messaging
  messaging: {
    rooms: "/messaging/rooms",
    room: (id: string) => `/messaging/rooms/${id}`,
    messages: (roomId: string) => `/messaging/rooms/${roomId}/messages`,
    createRoom: "/messaging/rooms",
  },

  // User
  user: {
    profile: "/user/profile",
    settings: "/user/settings",
    kyc: "/user/kyc",
    wallets: "/user/wallets",
    notifications: "/user/notifications",
  },

  // Deposits/Withdrawals
  funds: {
    accounts: "/funds/accounts",
    deposit: "/funds/deposit",
    withdraw: "/funds/withdraw",
    transactions: "/funds/transactions",
  },
};
