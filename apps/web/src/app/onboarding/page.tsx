"use client";

import Link from "next/link";
import { Button } from "@pull/ui";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pull/ui";

const features = [
  {
    icon: "📈",
    title: "Prediction Markets",
    description: "Trade on real-world events with transparent pricing",
  },
  {
    icon: "🃏",
    title: "Fractional Collectibles",
    description: "Own shares of graded Pokemon cards and collectibles",
  },
  {
    icon: "💬",
    title: "Integrated Messaging",
    description: "Chat with traders and execute orders via commands",
  },
  {
    icon: "🎁",
    title: "Rewards Program",
    description: "Earn points and convert them to $PULL tokens",
  },
];

export default function OnboardingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-2xl">
        {/* Logo and welcome */}
        <div className="text-center mb-8">
          <span className="text-5xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            PULL
          </span>
          <h1 className="text-2xl font-bold mt-4">Welcome to PULL</h1>
          <p className="text-muted-foreground mt-2">
            The super app for trading, predictions, and collectibles
          </p>
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {features.map((feature) => (
            <Card key={feature.title} className="text-center">
              <CardContent className="pt-6">
                <span className="text-4xl mb-4 block">{feature.icon}</span>
                <h3 className="font-medium mb-1">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Get Started</CardTitle>
            <CardDescription>
              Complete a quick identity verification to start trading
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-4 p-4 rounded-lg bg-muted">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                1
              </div>
              <div>
                <p className="font-medium">Identity Verification</p>
                <p className="text-sm text-muted-foreground">
                  Takes about 5 minutes to complete
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4 p-4 rounded-lg bg-muted/50">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold">
                2
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Fund Your Account</p>
                <p className="text-sm text-muted-foreground">
                  Connect your bank and make a deposit
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4 p-4 rounded-lg bg-muted/50">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold">
                3
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Start Trading</p>
                <p className="text-sm text-muted-foreground">
                  Trade prediction markets and collectibles
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button className="w-full" size="lg" asChild>
              <Link href="/onboarding/kyc">Start Verification</Link>
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              By continuing, you agree to our{" "}
              <Link href="/terms" className="underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline">
                Privacy Policy
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
