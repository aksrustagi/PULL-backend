"use client";

import { useCallback, useState, useEffect } from "react";
import {
  usePlaidLink,
  PlaidLinkOptions,
  PlaidLinkOnSuccess,
  PlaidLinkOnExit,
  PlaidLinkOnEvent,
} from "react-plaid-link";
import { toast } from "sonner";
import { Button } from "@pull/ui";

// ==========================================================================
// TYPES
// ==========================================================================

interface PlaidLinkButtonProps {
  linkToken: string;
  onSuccess: (publicToken: string, metadata: PlaidSuccessMetadata) => void;
  onExit?: (error: PlaidLinkError | null) => void;
  onEvent?: (eventName: string, metadata: PlaidEventMetadata) => void;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
}

interface PlaidSuccessMetadata {
  institution: {
    name: string;
    institution_id: string;
  } | null;
  accounts: Array<{
    id: string;
    name: string;
    mask: string;
    type: string;
    subtype: string;
  }>;
  link_session_id: string;
  public_token: string;
}

interface PlaidLinkError {
  error_type: string;
  error_code: string;
  error_message: string;
  display_message: string | null;
}

interface PlaidEventMetadata {
  [key: string]: unknown;
}

// ==========================================================================
// COMPONENT
// ==========================================================================

export function PlaidLinkButton({
  linkToken,
  onSuccess,
  onExit,
  onEvent,
  disabled,
  className,
  children,
  variant = "default",
  size = "default",
}: PlaidLinkButtonProps) {
  const handleSuccess: PlaidLinkOnSuccess = useCallback(
    (publicToken, metadata) => {
      console.log("[Plaid] Success:", { publicToken, metadata });
      toast.success("Bank account linked successfully!");
      onSuccess(publicToken, metadata as PlaidSuccessMetadata);
    },
    [onSuccess]
  );

  const handleExit: PlaidLinkOnExit = useCallback(
    (error, metadata) => {
      console.log("[Plaid] Exit:", { error, metadata });
      if (error) {
        console.error("[Plaid] Error on exit:", error);
        toast.error(error.display_message || "Failed to link bank account");
      }
      onExit?.(error as PlaidLinkError | null);
    },
    [onExit]
  );

  const handleEvent: PlaidLinkOnEvent = useCallback(
    (eventName, metadata) => {
      console.log("[Plaid] Event:", eventName, metadata);
      onEvent?.(eventName, metadata as PlaidEventMetadata);
    },
    [onEvent]
  );

  const config: PlaidLinkOptions = {
    token: linkToken,
    onSuccess: handleSuccess,
    onExit: handleExit,
    onEvent: handleEvent,
  };

  const { open, ready, error } = usePlaidLink(config);

  useEffect(() => {
    if (error) {
      console.error("[Plaid] Link error:", error);
      toast.error("Failed to initialize bank linking");
    }
  }, [error]);

  return (
    <Button
      onClick={() => open()}
      disabled={!ready || disabled}
      className={className}
      variant={variant}
      size={size}
    >
      {children || "Link Bank Account"}
    </Button>
  );
}

// ==========================================================================
// HOOKS
// ==========================================================================

/**
 * Hook to manage Plaid Link token
 */
export function usePlaidLinkToken() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLinkToken = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const authToken = localStorage.getItem("pull-auth-token");
      const response = await fetch("/api/kyc/plaid/link-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to get link token");
      }

      const data = await response.json();
      setLinkToken(data.linkToken);
      return data.linkToken;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to get link token";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    linkToken,
    isLoading,
    error,
    fetchLinkToken,
  };
}

/**
 * Hook to exchange Plaid public token for access token
 */
export function usePlaidExchange() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exchangeToken = useCallback(
    async (publicToken: string, accountId: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const authToken = localStorage.getItem("pull-auth-token");
        const response = await fetch("/api/kyc/plaid/exchange", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ publicToken, accountId }),
        });

        if (!response.ok) {
          throw new Error("Failed to link bank account");
        }

        const data = await response.json();
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to link account";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return {
    isLoading,
    error,
    exchangeToken,
  };
}

// ==========================================================================
// COMBINED COMPONENT WITH TOKEN MANAGEMENT
// ==========================================================================

interface PlaidLinkWithTokenProps {
  onSuccess: (publicToken: string, metadata: PlaidSuccessMetadata) => void;
  onExit?: (error: PlaidLinkError | null) => void;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
}

/**
 * Plaid Link button that handles token fetching automatically
 */
export function PlaidLinkWithToken({
  onSuccess,
  onExit,
  disabled,
  className,
  children,
  variant = "default",
  size = "default",
}: PlaidLinkWithTokenProps) {
  const { linkToken, isLoading, error, fetchLinkToken } = usePlaidLinkToken();

  useEffect(() => {
    fetchLinkToken();
  }, [fetchLinkToken]);

  if (error) {
    return (
      <Button
        onClick={() => fetchLinkToken()}
        variant="outline"
        className={className}
        size={size}
      >
        Retry Loading
      </Button>
    );
  }

  if (isLoading || !linkToken) {
    return (
      <Button disabled className={className} variant={variant} size={size}>
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading...
        </span>
      </Button>
    );
  }

  return (
    <PlaidLinkButton
      linkToken={linkToken}
      onSuccess={onSuccess}
      onExit={onExit}
      disabled={disabled}
      className={className}
      variant={variant}
      size={size}
    >
      {children}
    </PlaidLinkButton>
  );
}

export default PlaidLinkButton;
