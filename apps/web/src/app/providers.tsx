"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode, createContext, useContext, useEffect } from "react";
import { Toaster } from "sonner";

// ============================================================================
// Convex Client
// ============================================================================

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL environment variable is required");
}
const convex = new ConvexReactClient(convexUrl);

// ============================================================================
// Auth Context (for Convex auth integration)
// ============================================================================

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  token: null,
});

export function useAuthContext() {
  return useContext(AuthContext);
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthContextType>({
    isAuthenticated: false,
    isLoading: true,
    token: null,
  });

  useEffect(() => {
    // Check for existing auth token from Zustand persisted store (sessionStorage)
    const stored = sessionStorage.getItem("pull-auth");
    const token = stored ? JSON.parse(stored)?.state?.token : null;
    setAuthState({
      isAuthenticated: !!token,
      isLoading: false,
      token,
    });
  }, []);

  return (
    <AuthContext.Provider value={authState}>{children}</AuthContext.Provider>
  );
}

// ============================================================================
// Main Providers Component
// ============================================================================

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 5 * 60 * 1000, // 5 minutes
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 1,
          },
        },
      })
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <ConvexProvider client={convex}>
          <AuthProvider>
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                classNames: {
                  toast: "bg-background border-border",
                  title: "text-foreground",
                  description: "text-muted-foreground",
                  actionButton: "bg-primary text-primary-foreground",
                  cancelButton: "bg-muted text-muted-foreground",
                },
              }}
            />
          </AuthProvider>
        </ConvexProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
