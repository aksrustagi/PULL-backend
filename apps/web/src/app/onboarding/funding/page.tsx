"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@pull/ui";
import { Input } from "@pull/ui";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pull/ui";

// Preset amounts
const presetAmounts = [50, 100, 250, 500, 1000];

export default function FundingPage() {
  const router = useRouter();
  const [step, setStep] = useState<"connect" | "deposit">("connect");
  const [isLoading, setIsLoading] = useState(false);
  const [connectedAccount, setConnectedAccount] = useState<{
    name: string;
    mask: string;
    institution: string;
  } | null>(null);
  const [depositAmount, setDepositAmount] = useState("");

  const handlePlaidConnect = async () => {
    setIsLoading(true);
    try {
      // TODO: Initialize Plaid Link
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Simulated connected account
      setConnectedAccount({
        name: "Checking Account",
        mask: "1234",
        institution: "Chase Bank",
      });
      setStep("deposit");
      toast.success("Bank account connected!");
    } catch (error) {
      toast.error("Failed to connect bank account");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount < 10) {
      toast.error("Minimum deposit is $10");
      return;
    }

    setIsLoading(true);
    try {
      // TODO: Initiate deposit via API
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toast.success(`Deposit of $${amount.toFixed(2)} initiated!`);
      router.push("/onboarding/complete");
    } catch (error) {
      toast.error("Deposit failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Progress indicator */}
        <div className="flex items-center justify-center space-x-2 mb-8">
          <div className="h-2 w-16 rounded-full bg-primary" />
          <div className="h-2 w-16 rounded-full bg-primary" />
          <div
            className={`h-2 w-16 rounded-full ${
              step === "deposit" ? "bg-primary" : "bg-muted"
            }`}
          />
        </div>

        {step === "connect" ? (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <svg
                  className="h-6 w-6 text-primary"
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
              <CardTitle>Connect Your Bank</CardTitle>
              <CardDescription>
                Securely link your bank account to fund your PULL account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-muted space-y-3">
                <div className="flex items-center space-x-3">
                  <svg
                    className="h-5 w-5 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  <span className="text-sm">Bank-level security with Plaid</span>
                </div>
                <div className="flex items-center space-x-3">
                  <svg
                    className="h-5 w-5 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <span className="text-sm">Instant account verification</span>
                </div>
                <div className="flex items-center space-x-3">
                  <svg
                    className="h-5 w-5 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <span className="text-sm">
                    We never store your credentials
                  </span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button
                className="w-full"
                onClick={handlePlaidConnect}
                disabled={isLoading}
              >
                {isLoading ? "Connecting..." : "Connect Bank Account"}
              </Button>
              <Link
                href="/onboarding/complete"
                className="text-sm text-muted-foreground hover:underline"
              >
                Skip for now
              </Link>
            </CardFooter>
          </Card>
        ) : (
          <Card>
            <CardHeader className="text-center">
              <CardTitle>Make Your First Deposit</CardTitle>
              <CardDescription>
                Fund your account to start trading
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Connected account */}
              {connectedAccount && (
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <svg
                        className="h-5 w-5"
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
                    <div>
                      <p className="font-medium">{connectedAccount.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {connectedAccount.institution} ••••
                        {connectedAccount.mask}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep("connect")}
                  >
                    Change
                  </Button>
                </div>
              )}

              {/* Amount input */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Deposit Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    placeholder="0.00"
                    className="pl-7 text-lg"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    min="10"
                    step="0.01"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Minimum deposit: $10
                </p>
              </div>

              {/* Preset amounts */}
              <div className="flex flex-wrap gap-2">
                {presetAmounts.map((amount) => (
                  <Button
                    key={amount}
                    variant="outline"
                    size="sm"
                    onClick={() => setDepositAmount(amount.toString())}
                    className={
                      depositAmount === amount.toString()
                        ? "border-primary"
                        : ""
                    }
                  >
                    ${amount}
                  </Button>
                ))}
              </div>

              {/* Transfer time notice */}
              <div className="p-3 rounded-lg bg-muted text-sm text-muted-foreground">
                <p>
                  ACH transfers typically take 1-3 business days. Your funds
                  will be available for trading once the transfer completes.
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button
                className="w-full"
                onClick={handleDeposit}
                disabled={
                  isLoading ||
                  !depositAmount ||
                  parseFloat(depositAmount) < 10
                }
              >
                {isLoading
                  ? "Processing..."
                  : `Deposit $${parseFloat(depositAmount || "0").toFixed(2)}`}
              </Button>
              <Link
                href="/onboarding/complete"
                className="text-sm text-muted-foreground hover:underline"
              >
                Skip for now
              </Link>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  );
}
