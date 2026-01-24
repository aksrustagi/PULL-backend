/**
 * Auth Library
 * Authentication hooks and utilities
 */

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

// ============================================================================
// Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  kycStatus: "none" | "pending" | "approved" | "rejected";
  kycTier: "basic" | "enhanced" | "accredited";
  walletAddress?: string;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setTokens: (token: string | null, refreshToken: string | null) => void;
  logout: () => void;
}

// ============================================================================
// Auth Store
// ============================================================================

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      isLoading: true,
      isAuthenticated: false,
      setUser: (user) =>
        set({ user, isAuthenticated: !!user, isLoading: false }),
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
      logout: () =>
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: "pull-auth",
      // Use sessionStorage instead of localStorage to limit XSS token theft window.
      // sessionStorage is per-tab and cleared on tab close, reducing exposure.
      // The short-lived access token (15m) further limits risk.
      storage: {
        getItem: (name) => {
          if (typeof window === "undefined") return null;
          return sessionStorage.getItem(name);
        },
        setItem: (name, value) => {
          if (typeof window === "undefined") return;
          sessionStorage.setItem(name, value);
        },
        removeItem: (name) => {
          if (typeof window === "undefined") return;
          sessionStorage.removeItem(name);
        },
      },
      partialize: (state) => ({
        token: state.token,
        // refreshToken should be in an httpOnly cookie set by the API, not in browser storage
      }),
    }
  )
);

// ============================================================================
// Auth Hook
// ============================================================================

export function useAuth() {
  const router = useRouter();
  const {
    user,
    token,
    refreshToken,
    isLoading,
    isAuthenticated,
    setUser,
    setTokens,
    logout: storeLogout,
  } = useAuthStore();

  // Fetch current user on mount
  useEffect(() => {
    if (token && !user) {
      fetchCurrentUser();
    }
  }, [token]);

  const fetchCurrentUser = async () => {
    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        // Token invalid, try refresh
        await refreshAccessToken();
      }
    } catch (error) {
      console.error("Failed to fetch user:", error);
      storeLogout();
    }
  };

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Login failed");
      }

      const data = await response.json();
      setTokens(data.token, data.refreshToken);
      setUser(data.user);

      // Redirect based on KYC status
      if (data.user.kycStatus === "none") {
        router.push("/onboarding/kyc");
      } else {
        router.push("/");
      }

      return data.user;
    },
    [router, setTokens, setUser]
  );

  const register = useCallback(
    async (email: string, password: string, referralCode?: string) => {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, referralCode }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Registration failed");
      }

      const data = await response.json();
      setTokens(data.token, data.refreshToken);
      setUser(data.user);

      // New users go to onboarding
      router.push("/onboarding");

      return data.user;
    },
    [router, setTokens, setUser]
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      storeLogout();
      router.push("/login");
    }
  }, [token, storeLogout, router]);

  const refreshAccessToken = useCallback(async () => {
    if (!refreshToken) {
      storeLogout();
      return null;
    }

    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        storeLogout();
        return null;
      }

      const data = await response.json();
      setTokens(data.token, data.refreshToken);
      return data.token;
    } catch (error) {
      console.error("Token refresh failed:", error);
      storeLogout();
      return null;
    }
  }, [refreshToken, setTokens, storeLogout]);

  return {
    user,
    token,
    isLoading,
    isAuthenticated,
    login,
    register,
    logout,
    refreshAccessToken,
  };
}

// ============================================================================
// Protected Route Wrapper
// ============================================================================

export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  options?: {
    requiredKycStatus?: "approved" | "pending" | "none";
    requiredKycTier?: "basic" | "enhanced" | "accredited";
    redirectTo?: string;
  }
) {
  return function ProtectedComponent(props: P) {
    const router = useRouter();
    const { user, isLoading, isAuthenticated } = useAuth();

    useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        router.push(options?.redirectTo ?? "/login");
        return;
      }

      if (user) {
        // Check KYC status
        if (
          options?.requiredKycStatus &&
          user.kycStatus !== options.requiredKycStatus
        ) {
          router.push("/onboarding/kyc");
          return;
        }

        // Check KYC tier
        if (options?.requiredKycTier) {
          const tierOrder = { basic: 1, enhanced: 2, accredited: 3 };
          const userTier = tierOrder[user.kycTier];
          const requiredTier = tierOrder[options.requiredKycTier];

          if (userTier < requiredTier) {
            router.push("/settings/kyc");
            return;
          }
        }
      }
    }, [isLoading, isAuthenticated, user, router]);

    if (isLoading) {
      return (
        <div className="flex h-screen items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      );
    }

    if (!isAuthenticated) {
      return null;
    }

    return <Component {...props} />;
  };
}

// ============================================================================
// Auth Context for Server Components
// ============================================================================

export function getAuthHeaders(token: string | null): HeadersInit {
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`,
  };
}
