"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pull/ui";
import { Button } from "@pull/ui";
import { Badge } from "@pull/ui";
import { Input } from "@pull/ui";

// Tier configuration
const tiers = [
  { name: "Bronze", minPoints: 0, color: "text-amber-700", multiplier: 1 },
  { name: "Silver", minPoints: 1000, color: "text-gray-400", multiplier: 1.1 },
  { name: "Gold", minPoints: 5000, color: "text-yellow-500", multiplier: 1.25 },
  { name: "Platinum", minPoints: 25000, color: "text-cyan-400", multiplier: 1.5 },
  { name: "Diamond", minPoints: 100000, color: "text-purple-400", multiplier: 2 },
];

// Ways to earn
const waysToEarn = [
  { action: "Daily Login", points: 10, description: "Log in to earn daily points" },
  { action: "Complete Trade", points: 5, description: "Earn points for each completed trade" },
  { action: "First Trade of Day", points: 25, description: "Bonus for your first daily trade" },
  { action: "Refer a Friend", points: 500, description: "When your referral makes their first trade" },
  { action: "Complete KYC", points: 100, description: "One-time bonus for identity verification" },
  { action: "Connect Email", points: 50, description: "One-time bonus for email integration" },
];

// Rewards catalog
const rewardsCatalog = [
  {
    id: "1",
    name: "Trading Fee Discount",
    description: "10% off trading fees for 30 days",
    pointsCost: 500,
    category: "discount",
    available: true,
  },
  {
    id: "2",
    name: "Sweepstakes Entry",
    description: "Entry into monthly $1000 giveaway",
    pointsCost: 100,
    category: "sweepstakes",
    available: true,
  },
  {
    id: "3",
    name: "Premium Card Pack",
    description: "Exclusive Pokemon card mystery pack",
    pointsCost: 5000,
    category: "prize",
    available: false,
  },
  {
    id: "4",
    name: "$PULL Token Conversion",
    description: "Convert points to $PULL tokens",
    pointsCost: 1000,
    category: "token",
    available: true,
  },
];

export default function RewardsPage() {
  const [tokenConvertAmount, setTokenConvertAmount] = useState("");

  // Placeholder data
  const userPoints = {
    available: 0,
    lifetime: 0,
    tier: "Bronze",
    nextTier: "Silver",
    pointsToNextTier: 1000,
    currentStreak: 0,
    multiplier: 1,
  };

  const currentTierIndex = tiers.findIndex((t) => t.name === userPoints.tier);
  const nextTier = tiers[currentTierIndex + 1];
  const progress = nextTier
    ? (userPoints.lifetime / nextTier.minPoints) * 100
    : 100;

  // Conversion rate: 1000 points = 1 $PULL
  const conversionRate = 0.001;
  const convertedTokens =
    parseFloat(tokenConvertAmount || "0") * conversionRate;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Rewards</h1>
        <p className="text-muted-foreground">
          Earn points, unlock rewards, and convert to $PULL tokens
        </p>
      </div>

      {/* Points balance and tier */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-yellow-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Points Balance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-4">
              <span className="text-4xl font-bold">
                {userPoints.available.toLocaleString()}
              </span>
              <span className="text-muted-foreground">points available</span>
            </div>

            {/* Tier progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className={tiers[currentTierIndex].color}>
                  {userPoints.tier}
                </span>
                {nextTier && (
                  <span className="text-muted-foreground">
                    {userPoints.pointsToNextTier.toLocaleString()} points to{" "}
                    {nextTier.name}
                  </span>
                )}
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div>
                <p className="text-sm text-muted-foreground">Lifetime Points</p>
                <p className="font-medium">
                  {userPoints.lifetime.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Streak</p>
                <p className="font-medium">{userPoints.currentStreak} days</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Points Multiplier</p>
                <p className="font-medium">{userPoints.multiplier}x</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Token conversion */}
        <Card>
          <CardHeader>
            <CardTitle>Convert to $PULL</CardTitle>
            <CardDescription>1,000 points = 1 $PULL token</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Points to Convert</label>
              <Input
                type="number"
                placeholder="1000"
                min="1000"
                step="100"
                value={tokenConvertAmount}
                onChange={(e) => setTokenConvertAmount(e.target.value)}
              />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">You'll receive</span>
              <span className="font-medium">
                {convertedTokens.toFixed(4)} $PULL
              </span>
            </div>
            <Button
              className="w-full"
              disabled={
                !tokenConvertAmount ||
                parseFloat(tokenConvertAmount) < 1000 ||
                parseFloat(tokenConvertAmount) > userPoints.available
              }
            >
              Convert Points
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Ways to earn */}
      <Card>
        <CardHeader>
          <CardTitle>Ways to Earn</CardTitle>
          <CardDescription>
            Complete actions to earn points and level up your tier
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {waysToEarn.map((way) => (
              <div
                key={way.action}
                className="flex items-center justify-between p-4 rounded-lg border"
              >
                <div>
                  <p className="font-medium">{way.action}</p>
                  <p className="text-sm text-muted-foreground">
                    {way.description}
                  </p>
                </div>
                <Badge variant="secondary" className="ml-4">
                  +{way.points}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Rewards catalog */}
      <Card>
        <CardHeader>
          <CardTitle>Rewards Catalog</CardTitle>
          <CardDescription>Redeem your points for exclusive rewards</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rewardsCatalog.map((reward) => (
              <div
                key={reward.id}
                className={`p-4 rounded-lg border ${
                  !reward.available ? "opacity-50" : ""
                }`}
              >
                <Badge variant="outline" className="mb-3">
                  {reward.category}
                </Badge>
                <h3 className="font-medium mb-1">{reward.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {reward.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {reward.pointsCost.toLocaleString()} pts
                  </span>
                  <Button
                    size="sm"
                    disabled={
                      !reward.available ||
                      userPoints.available < reward.pointsCost
                    }
                  >
                    {reward.available ? "Redeem" : "Sold Out"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tier benefits */}
      <Card>
        <CardHeader>
          <CardTitle>Tier Benefits</CardTitle>
          <CardDescription>
            Earn more points as you level up your tier
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-5">
            {tiers.map((tier, idx) => (
              <div
                key={tier.name}
                className={`p-4 rounded-lg border text-center ${
                  tier.name === userPoints.tier
                    ? "border-primary bg-primary/5"
                    : ""
                }`}
              >
                <span className={`text-2xl font-bold ${tier.color}`}>
                  {tier.name}
                </span>
                <p className="text-sm text-muted-foreground mt-1">
                  {tier.minPoints.toLocaleString()}+ pts
                </p>
                <p className="text-lg font-medium mt-2">{tier.multiplier}x</p>
                <p className="text-xs text-muted-foreground">multiplier</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
