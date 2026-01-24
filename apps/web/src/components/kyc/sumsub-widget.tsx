"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { toast } from "sonner";

// ==========================================================================
// TYPES
// ==========================================================================

interface SumsubWidgetProps {
  accessToken: string;
  expirationHandler: () => Promise<string>;
  onComplete?: (payload: SumsubCompletePayload) => void;
  onError?: (error: SumsubError) => void;
  onActionSubmitted?: (payload: SumsubActionPayload) => void;
  onStepCompleted?: (payload: SumsubStepPayload) => void;
  onReady?: () => void;
  config?: SumsubConfig;
  className?: string;
}

interface SumsubCompletePayload {
  applicantId: string;
  reviewStatus: "completed" | "pending" | "init";
  reviewResult?: {
    reviewAnswer: "GREEN" | "RED" | "RETRY";
    rejectLabels?: string[];
    reviewRejectType?: string;
  };
}

interface SumsubError {
  code: string;
  message: string;
}

interface SumsubActionPayload {
  applicantId: string;
  action: string;
}

interface SumsubStepPayload {
  applicantId: string;
  step: string;
}

interface SumsubConfig {
  lang?: string;
  theme?: "light" | "dark";
  customCss?: string;
  uiConf?: {
    customCssStr?: string;
  };
}

interface SumsubSDK {
  init: (
    accessToken: string,
    expirationHandler: () => Promise<string>,
    config?: SumsubConfig
  ) => SumsubInstance;
}

interface SumsubInstance {
  onMessage: (
    event: string,
    handler: (payload: unknown) => void
  ) => SumsubInstance;
  withConf: (config: SumsubConfig) => SumsubInstance;
  build: () => SumsubWidget;
}

interface SumsubWidget {
  launch: (containerId: string) => void;
  destroy: () => void;
}

declare global {
  interface Window {
    snsWebSdk?: SumsubSDK;
  }
}

// ==========================================================================
// COMPONENT
// ==========================================================================

export function SumsubWidget({
  accessToken,
  expirationHandler,
  onComplete,
  onError,
  onActionSubmitted,
  onStepCompleted,
  onReady,
  config,
  className,
}: SumsubWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<SumsubWidget | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sdkError, setSdkError] = useState<string | null>(null);

  // Load Sumsub SDK script
  const loadSumsubSdk = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.snsWebSdk) {
        resolve();
        return;
      }

      // Check if script is already being loaded
      const existingScript = document.querySelector(
        'script[src*="sumsub"]'
      );
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve());
        existingScript.addEventListener("error", () =>
          reject(new Error("Failed to load Sumsub SDK"))
        );
        return;
      }

      // Load the script
      const script = document.createElement("script");
      script.src = "https://static.sumsub.com/idensic/static/sns-websdk-builder.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Sumsub SDK"));
      document.head.appendChild(script);
    });
  }, []);

  // Initialize widget
  const initializeWidget = useCallback(async () => {
    if (!containerRef.current || !window.snsWebSdk) {
      return;
    }

    try {
      // Destroy existing widget if any
      if (widgetRef.current) {
        widgetRef.current.destroy();
        widgetRef.current = null;
      }

      const sdk = window.snsWebSdk;

      // Build the widget
      let instance = sdk.init(accessToken, expirationHandler, config);

      // Add event handlers
      instance = instance
        .onMessage("idCheck.onApplicantLoaded", (payload: unknown) => {
          console.log("[Sumsub] Applicant loaded:", payload);
          setIsLoading(false);
          onReady?.();
        })
        .onMessage("idCheck.onApplicantSubmitted", (payload: unknown) => {
          console.log("[Sumsub] Applicant submitted:", payload);
          onActionSubmitted?.(payload as SumsubActionPayload);
        })
        .onMessage("idCheck.onApplicantResubmitted", (payload: unknown) => {
          console.log("[Sumsub] Applicant resubmitted:", payload);
          onActionSubmitted?.(payload as SumsubActionPayload);
        })
        .onMessage("idCheck.stepCompleted", (payload: unknown) => {
          console.log("[Sumsub] Step completed:", payload);
          onStepCompleted?.(payload as SumsubStepPayload);
        })
        .onMessage("idCheck.onApplicantStatusChanged", (payload: unknown) => {
          console.log("[Sumsub] Status changed:", payload);
          const typedPayload = payload as SumsubCompletePayload;
          if (
            typedPayload.reviewStatus === "completed" ||
            typedPayload.reviewResult
          ) {
            onComplete?.(typedPayload);
          }
        })
        .onMessage("idCheck.onError", (payload: unknown) => {
          console.error("[Sumsub] Error:", payload);
          const error = payload as SumsubError;
          onError?.(error);
          toast.error(`Verification error: ${error.message}`);
        });

      // Apply custom theme config
      if (config) {
        instance = instance.withConf(config);
      }

      // Build and launch
      const widget = instance.build();
      widget.launch("#sumsub-websdk-container");
      widgetRef.current = widget;
    } catch (error) {
      console.error("[Sumsub] Failed to initialize widget:", error);
      setSdkError("Failed to initialize verification widget");
      toast.error("Failed to load verification widget");
    }
  }, [
    accessToken,
    expirationHandler,
    config,
    onComplete,
    onError,
    onActionSubmitted,
    onStepCompleted,
    onReady,
  ]);

  // Load SDK and initialize widget
  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        await loadSumsubSdk();
        if (mounted) {
          await initializeWidget();
        }
      } catch (error) {
        if (mounted) {
          console.error("[Sumsub] Setup error:", error);
          setSdkError("Failed to load verification service");
          setIsLoading(false);
        }
      }
    };

    setup();

    return () => {
      mounted = false;
      if (widgetRef.current) {
        widgetRef.current.destroy();
        widgetRef.current = null;
      }
    };
  }, [loadSumsubSdk, initializeWidget]);

  // Handle access token changes (refresh)
  useEffect(() => {
    if (accessToken && window.snsWebSdk && containerRef.current) {
      initializeWidget();
    }
  }, [accessToken, initializeWidget]);

  if (sdkError) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg bg-destructive/10">
        <p className="text-destructive mb-4">{sdkError}</p>
        <button
          onClick={() => {
            setSdkError(null);
            setIsLoading(true);
            loadSumsubSdk().then(initializeWidget);
          }}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      {isLoading && (
        <div className="flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              Loading verification...
            </p>
          </div>
        </div>
      )}
      <div
        id="sumsub-websdk-container"
        ref={containerRef}
        className={isLoading ? "hidden" : "min-h-[500px]"}
      />
    </div>
  );
}

// ==========================================================================
// HOOKS
// ==========================================================================

/**
 * Hook to manage Sumsub access token with automatic refresh
 */
export function useSumsubToken() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchToken = useCallback(async (): Promise<string> => {
    setIsLoading(true);
    setError(null);

    try {
      const authToken = localStorage.getItem("pull-auth-token");
      const response = await fetch("/api/kyc/sumsub-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to get verification token");
      }

      const data = await response.json();
      setAccessToken(data.token);
      return data.token;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to get token";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshToken = useCallback(async (): Promise<string> => {
    return fetchToken();
  }, [fetchToken]);

  return {
    accessToken,
    isLoading,
    error,
    fetchToken,
    refreshToken,
  };
}

export default SumsubWidget;
