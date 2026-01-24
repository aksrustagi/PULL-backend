"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@pull/ui";
import { Input } from "@pull/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@pull/ui";
import { SumsubWidget, useSumsubToken } from "@/components/kyc";
import {
  PlaidLinkWithToken,
  usePlaidExchange,
} from "@/components/kyc/plaid-link-button";

// ==========================================================================
// TYPES
// ==========================================================================

type KYCStep = "tier" | "basic" | "verification" | "bank" | "complete";

type KYCTier = "basic" | "enhanced" | "accredited";

interface KYCStatus {
  step: KYCStep;
  tier: KYCTier;
  sumsubComplete: boolean;
  bankLinked: boolean;
  workflowId?: string;
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

// ==========================================================================
// STEPS CONFIGURATION
// ==========================================================================

const tierOptions = [
  {
    id: "basic" as KYCTier,
    name: "Basic",
    description: "Trade up to $10,000/month",
    requirements: ["Government ID", "Selfie verification", "Basic info"],
    limits: "$10,000/month trading limit",
  },
  {
    id: "enhanced" as KYCTier,
    name: "Enhanced",
    description: "Trade up to $100,000/month",
    requirements: [
      "Everything in Basic",
      "Background check",
      "Bank account linking",
    ],
    limits: "$100,000/month trading limit",
  },
  {
    id: "accredited" as KYCTier,
    name: "Accredited",
    description: "Unlimited trading",
    requirements: [
      "Everything in Enhanced",
      "Accredited investor verification",
      "Additional documentation",
    ],
    limits: "No trading limits",
  },
];

// ==========================================================================
// COMPONENT
// ==========================================================================

export default function KYCPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [kycStatus, setKycStatus] = useState<KYCStatus>({
    step: "tier",
    tier: "basic",
    sumsubComplete: false,
    bankLinked: false,
  });

  // Form state for basic info
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    country: "US",
    email: "",
    phone: "",
    agreements: {
      terms: false,
      privacy: false,
      trading: false,
    },
  });

  // Sumsub token management
  const {
    accessToken: sumsubToken,
    isLoading: tokenLoading,
    fetchToken: fetchSumsubToken,
    refreshToken: refreshSumsubToken,
  } = useSumsubToken();

  // Plaid exchange
  const { exchangeToken, isLoading: plaidExchangeLoading } = usePlaidExchange();

  // Fetch initial status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const authToken = localStorage.getItem("pull-auth-token");
        const response = await fetch("/api/kyc/status", {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.status) {
            // Resume from existing status
            setKycStatus((prev) => ({
              ...prev,
              workflowId: data.workflowId,
              tier: data.targetTier || prev.tier,
              sumsubComplete:
                data.status === "approved" ||
                data.sumsubReviewStatus === "completed",
              bankLinked: data.bankLinked || false,
            }));

            // Determine which step to show
            if (data.status === "approved") {
              setKycStatus((prev) => ({ ...prev, step: "complete" }));
            } else if (data.sumsubReviewStatus === "completed") {
              if (data.targetTier !== "basic" && !data.bankLinked) {
                setKycStatus((prev) => ({ ...prev, step: "bank" }));
              } else {
                setKycStatus((prev) => ({ ...prev, step: "complete" }));
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch KYC status:", error);
      }
    };

    fetchStatus();
  }, []);

  // Start KYC workflow
  const startKYC = async () => {
    setIsLoading(true);
    try {
      const authToken = localStorage.getItem("pull-auth-token");
      const response = await fetch("/api/kyc/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          tier: kycStatus.tier,
          userInfo: {
            firstName: formData.firstName,
            lastName: formData.lastName,
            dateOfBirth: formData.dateOfBirth,
            address: formData.address,
            city: formData.city,
            state: formData.state,
            zipCode: formData.zipCode,
            country: formData.country,
            email: formData.email,
            phone: formData.phone,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start verification");
      }

      const data = await response.json();
      setKycStatus((prev) => ({
        ...prev,
        workflowId: data.workflowId,
        step: "verification",
      }));

      // Fetch Sumsub token
      await fetchSumsubToken();
    } catch (error) {
      toast.error("Failed to start verification. Please try again.");
      console.error("Start KYC error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Sumsub completion
  const handleSumsubComplete = useCallback(
    (payload: {
      applicantId: string;
      reviewStatus: string;
      reviewResult?: { reviewAnswer: string };
    }) => {
      console.log("Sumsub complete:", payload);

      if (
        payload.reviewResult?.reviewAnswer === "GREEN" ||
        payload.reviewStatus === "completed"
      ) {
        toast.success("Identity verification complete!");
        setKycStatus((prev) => ({
          ...prev,
          sumsubComplete: true,
          step:
            prev.tier === "basic"
              ? "complete"
              : "bank",
        }));
      } else if (payload.reviewResult?.reviewAnswer === "RED") {
        toast.error(
          "Verification was not successful. Please contact support."
        );
      }
    },
    []
  );

  // Handle Sumsub error
  const handleSumsubError = useCallback(
    (error: { code: string; message: string }) => {
      console.error("Sumsub error:", error);
      toast.error(`Verification error: ${error.message}`);
    },
    []
  );

  // Handle Plaid success
  const handlePlaidSuccess = async (
    publicToken: string,
    metadata: PlaidSuccessMetadata
  ) => {
    try {
      const accountId = metadata.accounts[0]?.id;
      if (!accountId) {
        throw new Error("No account selected");
      }

      await exchangeToken(publicToken, accountId);

      toast.success("Bank account linked successfully!");
      setKycStatus((prev) => ({
        ...prev,
        bankLinked: true,
        step: "complete",
      }));
    } catch (error) {
      console.error("Plaid exchange error:", error);
      toast.error("Failed to link bank account. Please try again.");
    }
  };

  // Check if basic info is complete
  const isBasicInfoComplete = () => {
    return (
      formData.firstName &&
      formData.lastName &&
      formData.dateOfBirth &&
      formData.address &&
      formData.city &&
      formData.state &&
      formData.zipCode &&
      formData.email &&
      formData.agreements.terms &&
      formData.agreements.privacy &&
      formData.agreements.trading
    );
  };

  // Render current step
  const renderStep = () => {
    switch (kycStatus.step) {
      case "tier":
        return renderTierSelection();
      case "basic":
        return renderBasicInfo();
      case "verification":
        return renderVerification();
      case "bank":
        return renderBankLinking();
      case "complete":
        return renderComplete();
      default:
        return null;
    }
  };

  // Tier selection step
  const renderTierSelection = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Choose Your Account Type</h2>
        <p className="text-muted-foreground">
          Select the verification level that matches your trading needs
        </p>
      </div>

      <div className="grid gap-4">
        {tierOptions.map((tier) => (
          <label
            key={tier.id}
            className={`flex flex-col p-6 rounded-lg border-2 cursor-pointer transition-colors ${
              kycStatus.tier === tier.id
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {tier.description}
                </p>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Requirements:</p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside">
                    {tier.requirements.map((req, idx) => (
                      <li key={idx}>{req}</li>
                    ))}
                  </ul>
                </div>

                <p className="text-sm font-medium text-primary mt-4">
                  {tier.limits}
                </p>
              </div>

              <input
                type="radio"
                name="tier"
                value={tier.id}
                checked={kycStatus.tier === tier.id}
                onChange={() =>
                  setKycStatus((prev) => ({ ...prev, tier: tier.id }))
                }
                className="mt-1"
              />
            </div>
          </label>
        ))}
      </div>

      <Button
        onClick={() => setKycStatus((prev) => ({ ...prev, step: "basic" }))}
        className="w-full"
        size="lg"
      >
        Continue
      </Button>
    </div>
  );

  // Basic info step
  const renderBasicInfo = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Personal Information</h2>
        <p className="text-muted-foreground">
          We need some basic information to verify your identity
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">First Name</label>
            <Input
              placeholder="John"
              value={formData.firstName}
              onChange={(e) =>
                setFormData({ ...formData, firstName: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Last Name</label>
            <Input
              placeholder="Doe"
              value={formData.lastName}
              onChange={(e) =>
                setFormData({ ...formData, lastName: e.target.value })
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Date of Birth</label>
            <Input
              type="date"
              value={formData.dateOfBirth}
              onChange={(e) =>
                setFormData({ ...formData, dateOfBirth: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Phone Number</label>
            <Input
              type="tel"
              placeholder="+1 (555) 123-4567"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <Input
            type="email"
            placeholder="john@example.com"
            value={formData.email}
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Street Address</label>
          <Input
            placeholder="123 Main St"
            value={formData.address}
            onChange={(e) =>
              setFormData({ ...formData, address: e.target.value })
            }
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">City</label>
            <Input
              placeholder="New York"
              value={formData.city}
              onChange={(e) =>
                setFormData({ ...formData, city: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">State</label>
            <Input
              placeholder="NY"
              maxLength={2}
              value={formData.state}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  state: e.target.value.toUpperCase(),
                })
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">ZIP Code</label>
            <Input
              placeholder="10001"
              value={formData.zipCode}
              onChange={(e) =>
                setFormData({ ...formData, zipCode: e.target.value })
              }
            />
          </div>
        </div>

        {/* Agreements */}
        <div className="space-y-4 pt-4 border-t">
          <p className="text-sm font-medium">Agreements</p>

          <label className="flex items-start space-x-3 p-4 rounded-lg border cursor-pointer hover:bg-muted/50">
            <input
              type="checkbox"
              className="mt-1"
              checked={formData.agreements.terms}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  agreements: {
                    ...formData.agreements,
                    terms: e.target.checked,
                  },
                })
              }
            />
            <div>
              <p className="font-medium">Terms of Service</p>
              <p className="text-sm text-muted-foreground">
                I have read and agree to the{" "}
                <Link href="/terms" className="text-primary underline">
                  Terms of Service
                </Link>
              </p>
            </div>
          </label>

          <label className="flex items-start space-x-3 p-4 rounded-lg border cursor-pointer hover:bg-muted/50">
            <input
              type="checkbox"
              className="mt-1"
              checked={formData.agreements.privacy}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  agreements: {
                    ...formData.agreements,
                    privacy: e.target.checked,
                  },
                })
              }
            />
            <div>
              <p className="font-medium">Privacy Policy</p>
              <p className="text-sm text-muted-foreground">
                I have read and agree to the{" "}
                <Link href="/privacy" className="text-primary underline">
                  Privacy Policy
                </Link>
              </p>
            </div>
          </label>

          <label className="flex items-start space-x-3 p-4 rounded-lg border cursor-pointer hover:bg-muted/50">
            <input
              type="checkbox"
              className="mt-1"
              checked={formData.agreements.trading}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  agreements: {
                    ...formData.agreements,
                    trading: e.target.checked,
                  },
                })
              }
            />
            <div>
              <p className="font-medium">Trading Disclosures</p>
              <p className="text-sm text-muted-foreground">
                I understand the risks of trading prediction markets and
                fractional assets
              </p>
            </div>
          </label>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button
          variant="outline"
          onClick={() => setKycStatus((prev) => ({ ...prev, step: "tier" }))}
        >
          Back
        </Button>
        <Button onClick={startKYC} disabled={!isBasicInfoComplete() || isLoading}>
          {isLoading ? "Starting..." : "Continue to Verification"}
        </Button>
      </div>
    </div>
  );

  // Verification step (Sumsub)
  const renderVerification = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Identity Verification</h2>
        <p className="text-muted-foreground">
          Complete identity verification to continue
        </p>
      </div>

      {tokenLoading ? (
        <div className="flex items-center justify-center p-12">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              Preparing verification...
            </p>
          </div>
        </div>
      ) : sumsubToken ? (
        <SumsubWidget
          accessToken={sumsubToken}
          expirationHandler={refreshSumsubToken}
          onComplete={handleSumsubComplete}
          onError={handleSumsubError}
          config={{
            lang: "en",
            theme: "dark",
          }}
          className="min-h-[500px]"
        />
      ) : (
        <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">
            Failed to load verification
          </p>
          <Button onClick={fetchSumsubToken}>Retry</Button>
        </div>
      )}
    </div>
  );

  // Bank linking step (Plaid)
  const renderBankLinking = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Link Your Bank Account</h2>
        <p className="text-muted-foreground">
          Connect your bank account to enable deposits and withdrawals
        </p>
      </div>

      <div className="flex flex-col items-center p-12 border-2 border-dashed rounded-lg bg-muted/50">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <svg
            className="h-8 w-8 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
            />
          </svg>
        </div>

        <h3 className="text-lg font-medium mb-2">Secure Bank Connection</h3>
        <p className="text-sm text-muted-foreground text-center mb-6 max-w-md">
          We use Plaid to securely connect to your bank. Your credentials are
          never stored on our servers.
        </p>

        <PlaidLinkWithToken
          onSuccess={handlePlaidSuccess}
          disabled={plaidExchangeLoading}
          size="lg"
        >
          {plaidExchangeLoading ? "Linking..." : "Connect Bank Account"}
        </PlaidLinkWithToken>

        {kycStatus.tier === "enhanced" && (
          <Button
            variant="ghost"
            className="mt-4"
            onClick={() =>
              setKycStatus((prev) => ({ ...prev, step: "complete" }))
            }
          >
            Skip for now
          </Button>
        )}
      </div>

      <div className="p-4 rounded-lg bg-muted">
        <p className="text-sm text-muted-foreground">
          <strong>Why do we need this?</strong> Bank linking is required for
          enhanced accounts to enable deposits, withdrawals, and higher trading
          limits.
        </p>
      </div>
    </div>
  );

  // Complete step
  const renderComplete = () => (
    <div className="space-y-6">
      <div className="text-center py-12">
        <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
          <svg
            className="h-10 w-10 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h2 className="text-2xl font-bold mb-2">Verification Complete!</h2>
        <p className="text-muted-foreground mb-8">
          Your {kycStatus.tier} account has been verified. You can now start
          trading.
        </p>

        <div className="space-y-4">
          <Button onClick={() => router.push("/onboarding/funding")} size="lg">
            Fund Your Account
          </Button>

          <div>
            <Button
              variant="outline"
              onClick={() => router.push("/")}
            >
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>

      {/* Status summary */}
      <div className="p-6 rounded-lg bg-muted">
        <h3 className="font-medium mb-4">Verification Summary</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Account Type</span>
            <span className="text-sm font-medium capitalize">
              {kycStatus.tier}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Identity Verified</span>
            <span className="text-sm font-medium text-green-500">
              Complete
            </span>
          </div>
          {kycStatus.tier !== "basic" && (
            <div className="flex items-center justify-between">
              <span className="text-sm">Bank Account</span>
              <span
                className={`text-sm font-medium ${
                  kycStatus.bankLinked ? "text-green-500" : "text-yellow-500"
                }`}
              >
                {kycStatus.bankLinked ? "Linked" : "Not linked"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Progress indicator
  const getProgress = () => {
    const steps = ["tier", "basic", "verification"];
    if (kycStatus.tier !== "basic") {
      steps.push("bank");
    }
    steps.push("complete");

    const currentIndex = steps.indexOf(kycStatus.step);
    return {
      current: currentIndex + 1,
      total: steps.length,
      percentage: ((currentIndex + 1) / steps.length) * 100,
    };
  };

  const progress = getProgress();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl">
        {/* Progress bar */}
        {kycStatus.step !== "complete" && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                Step {progress.current} of {progress.total}
              </span>
              <span className="text-sm font-medium">
                {Math.round(progress.percentage)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <Card>
          <CardContent className="pt-6">{renderStep()}</CardContent>
        </Card>

        {/* Skip link */}
        {kycStatus.step !== "complete" && (
          <p className="text-center text-sm text-muted-foreground mt-4">
            <Link href="/" className="underline">
              Skip for now
            </Link>{" "}
            (limited features)
          </p>
        )}
      </div>
    </div>
  );
}
