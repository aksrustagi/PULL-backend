/**
 * Auth Context - React Context API for Authentication
 * Provides authentication state and methods throughout the app
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";
import { api, ApiError } from "../services/api";
import type { User } from "../types";

// ============================================================================
// Types
// ============================================================================

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

interface AuthProviderProps {
  children: ReactNode;
}

// Storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: "accessToken",
  REFRESH_TOKEN: "refreshToken",
  USER: "user",
};

// ============================================================================
// Context
// ============================================================================

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    isInitialized: false,
  });

  // Initialize auth state on mount
  useEffect(() => {
    initializeAuth();
  }, []);

  /**
   * Initialize authentication state from secure storage
   */
  const initializeAuth = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      // Initialize the API client (loads stored token)
      await api.init();

      // Try to load cached user data
      const userJson = await SecureStore.getItemAsync(STORAGE_KEYS.USER);
      if (userJson) {
        const user = JSON.parse(userJson) as User;
        setState({
          user,
          isAuthenticated: true,
          isLoading: false,
          isInitialized: true,
        });

        // Optionally refresh user data in the background
        refreshUserData();
      } else {
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
        });
      }
    } catch (error) {
      console.error("Failed to initialize auth:", error);
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
      });
    }
  };

  /**
   * Refresh user data from the server
   */
  const refreshUserData = async () => {
    try {
      const response = await api.getCurrentUser();
      if (response.data) {
        await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(response.data));
        setState((prev) => ({
          ...prev,
          user: response.data,
          isAuthenticated: true,
        }));
      }
    } catch (error) {
      // Token might be invalid, logout
      if (error instanceof ApiError && error.status === 401) {
        await performLogout();
      }
    }
  };

  /**
   * Login with email and password
   */
  const login = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const { user, accessToken } = await api.login(email, password);

      // Store user data
      await SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(user));

      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
      });
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  /**
   * Register a new account
   */
  const register = useCallback(async (email: string, password: string, displayName: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      await api.register(email, password, displayName);

      // Auto-login after successful registration
      await login(email, password);
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [login]);

  /**
   * Perform logout cleanup
   */
  const performLogout = async () => {
    // Clear stored tokens and user data
    await Promise.all([
      SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN),
      SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN),
      SecureStore.deleteItemAsync(STORAGE_KEYS.USER),
    ]);

    // Clear API token
    api.setAccessToken(null);

    setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: true,
    });
  };

  /**
   * Logout the current user
   */
  const logout = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      // Call logout endpoint (optional, for server-side cleanup)
      await api.logout();
    } catch (error) {
      // Ignore errors, still clear local state
      console.warn("Logout API call failed:", error);
    }

    await performLogout();
  }, []);

  /**
   * Refresh user data from server
   */
  const refreshUser = useCallback(async () => {
    await refreshUserData();
  }, []);

  /**
   * Update local user state (optimistic updates)
   */
  const updateUser = useCallback((updates: Partial<User>) => {
    setState((prev) => {
      if (!prev.user) return prev;
      const updatedUser = { ...prev.user, ...updates };
      // Persist to storage
      SecureStore.setItemAsync(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
      return { ...prev, user: updatedUser };
    });
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      register,
      logout,
      refreshUser,
      updateUser,
    }),
    [state, login, register, logout, refreshUser, updateUser]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access auth context
 * @throws Error if used outside AuthProvider
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}

// ============================================================================
// Higher-Order Components
// ============================================================================

/**
 * HOC to require authentication for a component
 */
export function withAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  FallbackComponent?: React.ComponentType
) {
  return function AuthenticatedComponent(props: P) {
    const { isAuthenticated, isInitialized, isLoading } = useAuth();

    if (!isInitialized || isLoading) {
      // Show loading state
      return null;
    }

    if (!isAuthenticated) {
      if (FallbackComponent) {
        return <FallbackComponent />;
      }
      return null;
    }

    return <WrappedComponent {...props} />;
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if user has specific permission/role
 */
export function hasPermission(user: User | null, permission: string): boolean {
  if (!user) return false;
  // Implement your permission logic here
  return true;
}

/**
 * Get display name or fallback
 */
export function getDisplayName(user: User | null): string {
  if (!user) return "Guest";
  return user.displayName || user.email.split("@")[0] || "User";
}

/**
 * Get user initials for avatar
 */
export function getUserInitials(user: User | null): string {
  if (!user) return "?";

  if (user.displayName) {
    const parts = user.displayName.trim().split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return user.displayName[0].toUpperCase();
  }

  return user.email[0].toUpperCase();
}

export default AuthContext;
