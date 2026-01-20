"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@pull/ui";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pull/ui";

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const token = searchParams.get("token");

  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Auto-verify if token is present
  useEffect(() => {
    if (token) {
      verifyEmail(token);
    }
  }, [token]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const verifyEmail = async (verificationToken: string) => {
    setIsVerifying(true);

    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: verificationToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Verification failed");
      }

      setVerified(true);
      toast.success("Email verified successfully!");

      // Redirect to onboarding after delay
      setTimeout(() => {
        router.push("/onboarding");
      }, 2000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  const resendVerification = async () => {
    if (!email || countdown > 0) return;

    setIsResending(true);

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to resend");
      }

      toast.success("Verification email sent!");
      setCountdown(60); // 60 second cooldown
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resend");
    } finally {
      setIsResending(false);
    }
  };

  if (verified) {
    return (
      <Card>
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
            <svg
              className="h-6 w-6 text-green-600 dark:text-green-400"
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
          <CardTitle className="text-2xl">Email Verified!</CardTitle>
          <CardDescription>
            Your email has been verified successfully. Redirecting you to onboarding...
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isVerifying) {
    return (
      <Card>
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          </div>
          <CardTitle className="text-2xl">Verifying...</CardTitle>
          <CardDescription>
            Please wait while we verify your email address.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-1 text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
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
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <CardTitle className="text-2xl">Check your email</CardTitle>
        <CardDescription>
          We sent a verification link to{" "}
          <span className="font-medium text-foreground">{email || "your email"}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          Click the link in the email to verify your account. If you don't see
          it, check your spam folder.
        </p>
      </CardContent>
      <CardFooter className="flex flex-col space-y-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={resendVerification}
          disabled={isResending || countdown > 0}
        >
          {isResending
            ? "Sending..."
            : countdown > 0
            ? `Resend in ${countdown}s`
            : "Resend verification email"}
        </Button>
        <p className="text-sm text-muted-foreground text-center">
          Wrong email?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Try again
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
