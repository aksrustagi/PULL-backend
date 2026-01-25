/**
 * Error Boundary Component
 * Catches React errors and displays fallback UI
 */

import React, { Component, ErrorInfo } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, borderRadius, typography } from "../constants/theme";

// ============================================================================
// Types
// ============================================================================

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: "screen" | "component" | "app";
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// ============================================================================
// Error Boundary Class Component
// ============================================================================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Report to error tracking service
    this.props.onError?.(error, errorInfo);

    // Log to console in dev
    if (__DEV__) {
      console.error("ErrorBoundary caught:", error, errorInfo);
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { level = "component" } = this.props;

      if (level === "app") {
        return <AppLevelError error={this.state.error} onReset={this.reset} />;
      }

      if (level === "screen") {
        return <ScreenLevelError error={this.state.error} onReset={this.reset} />;
      }

      return <ComponentLevelError error={this.state.error} onReset={this.reset} />;
    }

    return this.props.children;
  }
}

// ============================================================================
// App-Level Error (Full Screen)
// ============================================================================

function AppLevelError({ error, onReset }: { error: Error | null; onReset: () => void }) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.xl,
    }}>
      <View style={{
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: colors.negative + "20",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: spacing.xl,
      }}>
        <Ionicons name="alert-circle" size={60} color={colors.negative} />
      </View>

      <Text style={{
        fontSize: typography.fontSize.xxl,
        fontWeight: typography.fontWeight.bold,
        color: colors.text,
        textAlign: "center",
        marginBottom: spacing.md,
      }}>
        Something Went Wrong
      </Text>

      <Text style={{
        fontSize: typography.fontSize.md,
        color: colors.textSecondary,
        textAlign: "center",
        marginBottom: spacing.xl,
        lineHeight: 24,
      }}>
        The app encountered an unexpected error. Please try restarting.
      </Text>

      {__DEV__ && error && (
        <ScrollView style={{
          maxHeight: 150,
          backgroundColor: colors.card,
          borderRadius: borderRadius.md,
          padding: spacing.md,
          marginBottom: spacing.xl,
          width: "100%",
        }}>
          <Text style={{ color: colors.negative, fontSize: typography.fontSize.xs, fontFamily: "monospace" }}>
            {error.message}
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: 10, marginTop: spacing.sm, fontFamily: "monospace" }}>
            {error.stack?.split("\n").slice(0, 5).join("\n")}
          </Text>
        </ScrollView>
      )}

      <Pressable
        onPress={onReset}
        style={{
          backgroundColor: colors.primary,
          borderRadius: borderRadius.lg,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.xxl,
          width: "100%",
          alignItems: "center",
        }}
      >
        <Text style={{ color: colors.textInverse, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold }}>
          Try Again
        </Text>
      </Pressable>
    </View>
  );
}

// ============================================================================
// Screen-Level Error
// ============================================================================

function ScreenLevelError({ error, onReset }: { error: Error | null; onReset: () => void }) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.xl,
    }}>
      <Ionicons name="warning" size={48} color={colors.warning} />
      <Text style={{
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text,
        marginTop: spacing.lg,
        textAlign: "center",
      }}>
        Failed to Load
      </Text>
      <Text style={{
        fontSize: typography.fontSize.sm,
        color: colors.textSecondary,
        marginTop: spacing.sm,
        textAlign: "center",
      }}>
        This screen couldn't load properly.
      </Text>

      {__DEV__ && error && (
        <Text style={{
          fontSize: typography.fontSize.xs,
          color: colors.negative,
          marginTop: spacing.md,
          textAlign: "center",
          fontFamily: "monospace",
        }}>
          {error.message}
        </Text>
      )}

      <Pressable
        onPress={onReset}
        style={{
          backgroundColor: colors.primary,
          borderRadius: borderRadius.lg,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.xl,
          marginTop: spacing.xl,
        }}
      >
        <Text style={{ color: colors.textInverse, fontWeight: typography.fontWeight.semibold }}>Retry</Text>
      </Pressable>
    </View>
  );
}

// ============================================================================
// Component-Level Error (Inline)
// ============================================================================

function ComponentLevelError({ error, onReset }: { error: Error | null; onReset: () => void }) {
  return (
    <View style={{
      backgroundColor: colors.negative + "10",
      borderRadius: borderRadius.md,
      padding: spacing.md,
      flexDirection: "row",
      alignItems: "center",
    }}>
      <Ionicons name="alert-circle" size={20} color={colors.negative} />
      <Text style={{ color: colors.negative, flex: 1, marginHorizontal: spacing.sm, fontSize: typography.fontSize.sm }}>
        Failed to render
      </Text>
      <Pressable onPress={onReset}>
        <Text style={{ color: colors.primary, fontWeight: typography.fontWeight.medium, fontSize: typography.fontSize.sm }}>
          Retry
        </Text>
      </Pressable>
    </View>
  );
}

// ============================================================================
// HOC Wrapper
// ============================================================================

export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: Omit<ErrorBoundaryProps, "children"> = {}
) {
  return function ErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary {...options}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

// ============================================================================
// Query Error Fallback (for React Query)
// ============================================================================

export function QueryErrorFallback({
  error,
  onRetry,
  message,
}: {
  error: Error;
  onRetry: () => void;
  message?: string;
}) {
  return (
    <View style={{
      padding: spacing.xl,
      alignItems: "center",
      justifyContent: "center",
    }}>
      <Ionicons name="cloud-offline" size={48} color={colors.textSecondary} />
      <Text style={{
        fontSize: typography.fontSize.md,
        fontWeight: typography.fontWeight.medium,
        color: colors.text,
        marginTop: spacing.md,
        textAlign: "center",
      }}>
        {message || "Unable to Load Data"}
      </Text>
      <Text style={{
        fontSize: typography.fontSize.sm,
        color: colors.textSecondary,
        marginTop: spacing.sm,
        textAlign: "center",
      }}>
        {error.message || "Please check your connection and try again."}
      </Text>
      <Pressable
        onPress={onRetry}
        style={{
          backgroundColor: colors.primary,
          borderRadius: borderRadius.lg,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.xl,
          marginTop: spacing.lg,
        }}
      >
        <Text style={{ color: colors.textInverse, fontWeight: typography.fontWeight.semibold }}>Try Again</Text>
      </Pressable>
    </View>
  );
}
