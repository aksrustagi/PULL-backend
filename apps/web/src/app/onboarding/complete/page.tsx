"use client";

import Link from "next/link";
import { Button } from "@pull/ui";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pull/ui";

const suggestedActions = [
  {
    icon: "📈",
    title: "Make Your First Trade",
    description: "Browse prediction markets and place your first order",
    href: "/trade",
  },
  {
    icon: "🃏",
    title: "Explore Collectibles",
    description: "Discover fractional Pokemon card investments",
    href: "/collectibles",
  },
  {
    icon: "💬",
    title: "Join the Community",
    description: "Connect with other traders in our chat rooms",
    href: "/messages",
  },
  {
    icon: "📧",
    title: "Connect Your Email",
    description: "Get AI-powered email triage and trading insights",
    href: "/settings/email",
  },
];

export default function OnboardingCompletePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-2xl">
        {/* Celebration animation placeholder */}
        <div className="text-center mb-8">
          <div className="relative inline-block">
            <div className="text-6xl mb-4">🎉</div>
            <div className="absolute -top-2 -left-4 text-2xl animate-bounce delay-100">
              ✨
            </div>
            <div className="absolute -top-2 -right-4 text-2xl animate-bounce delay-200">
              ✨
            </div>
          </div>
        </div>

        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-2xl">You're All Set!</CardTitle>
            <CardDescription className="text-lg">
              Your PULL account is ready to go
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Account summary */}
            <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-muted">
              <div>
                <p className="text-sm text-muted-foreground">Account Status</p>
                <p className="font-medium text-green-500">Verified</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">KYC Tier</p>
                <p className="font-medium">Basic</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bonus Points</p>
                <p className="font-medium">+100</p>
              </div>
            </div>

            {/* Suggested actions */}
            <div className="text-left">
              <h3 className="font-medium mb-4">Suggested Next Steps</h3>
              <div className="grid gap-3">
                {suggestedActions.map((action) => (
                  <Link
                    key={action.title}
                    href={action.href}
                    className="flex items-center space-x-4 p-4 rounded-lg border hover:bg-muted transition-colors"
                  >
                    <span className="text-2xl">{action.icon}</span>
                    <div className="flex-1">
                      <p className="font-medium">{action.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {action.description}
                      </p>
                    </div>
                    <svg
                      className="h-5 w-5 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button className="w-full" size="lg" asChild>
              <Link href="/">Enter PULL</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Need help?{" "}
              <Link href="/support" className="underline">
                Contact Support
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
