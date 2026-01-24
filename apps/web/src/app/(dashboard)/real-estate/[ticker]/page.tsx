"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pull/ui";
import { Button } from "@pull/ui";
import { Input } from "@pull/ui";
import { Badge } from "@pull/ui";

// Mock market data
const marketData = {
  ticker: "RE-MIA-MEDIAN-Q2",
  title: "Will median home price in Miami exceed $600K by Q2 2025?",
  description:
    "This market resolves YES if the Zillow Home Value Index (ZHVI) for Miami-Dade County, FL exceeds $600,000 at any point before June 30, 2025. Resolution source: Zillow Research Data.",
  category: "median_price",
  status: "open",
  geographicScope: "city",
  location: "Miami, FL",
  targetMetric: "median_home_price",
  targetValue: 600000,
  currentValue: 582000,
  baselineValue: 545000,
  comparisonOperator: "gt",
  yesPrice: 0.65,
  noPrice: 0.35,
  yesVolume: 125000,
  noVolume: 60000,
  totalVolume: 185000,
  openInterest: 45000,
  liquidity: 28000,
  resolutionSource: "Zillow ZHVI",
  resolutionSourceUrl: "https://www.zillow.com/research/data/",
  openTime: "2024-10-01T00:00:00Z",
  closeTime: "2025-06-30T23:59:59Z",
  lastDataUpdate: "2025-01-15T12:00:00Z",
  dataUpdateFrequency: "monthly",
  priceHistory: [
    { date: "2024-10", price: 0.52 },
    { date: "2024-11", price: 0.55 },
    { date: "2024-12", price: 0.58 },
    { date: "2025-01", price: 0.65 },
  ],
  metricHistory: [
    { date: "2024-10", value: 565000 },
    { date: "2024-11", value: 572000 },
    { date: "2024-12", value: 578000 },
    { date: "2025-01", value: 582000 },
  ],
};

export default function RealEstateMarketPage({
  params,
}: {
  params: { ticker: string };
}) {
  const [orderSide, setOrderSide] = useState<"yes" | "no">("yes");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");

  const currentPrice = orderSide === "yes" ? marketData.yesPrice : marketData.noPrice;
  const estimatedCost = quantity
    ? parseFloat(quantity) * (orderType === "market" ? currentPrice : parseFloat(limitPrice) || currentPrice)
    : 0;

  const progressPercent = (marketData.currentValue / marketData.targetValue) * 100;
  const changeFromBaseline = ((marketData.currentValue - marketData.baselineValue) / marketData.baselineValue) * 100;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center text-sm text-muted-foreground">
        <Link href="/real-estate" className="hover:text-foreground">
          Real Estate Markets
        </Link>
        <span className="mx-2">/</span>
        <span>{params.ticker}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Market Info */}
        <div className="flex-1 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">{marketData.location}</Badge>
                <Badge
                  variant={marketData.status === "open" ? "default" : "secondary"}
                >
                  {marketData.status.toUpperCase()}
                </Badge>
              </div>
              <h1 className="text-2xl font-bold mb-2">{marketData.title}</h1>
              <p className="text-sm text-muted-foreground">
                {marketData.ticker}
              </p>
            </div>
          </div>

          <p className="text-muted-foreground">{marketData.description}</p>

          {/* Current Progress Card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row justify-between gap-4 mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">Current Value</p>
                  <p className="text-3xl font-bold">
                    ${(marketData.currentValue / 1000).toFixed(0)}K
                  </p>
                  <p className={`text-sm ${changeFromBaseline >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {changeFromBaseline >= 0 ? "+" : ""}
                    {changeFromBaseline.toFixed(1)}% from baseline
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Target Value</p>
                  <p className="text-3xl font-bold">
                    ${(marketData.targetValue / 1000).toFixed(0)}K
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {(100 - progressPercent).toFixed(1)}% remaining
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Baseline: ${(marketData.baselineValue / 1000).toFixed(0)}K</span>
                  <span>{progressPercent.toFixed(1)}% to target</span>
                </div>
                <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, progressPercent)}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-between text-sm text-muted-foreground">
                <span>
                  Data source:{" "}
                  <a
                    href={marketData.resolutionSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {marketData.resolutionSource}
                  </a>
                </span>
                <span>Updated: {new Date(marketData.lastDataUpdate).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>

          {/* Price Chart Placeholder */}
          <Card>
            <CardHeader>
              <CardTitle>Price History</CardTitle>
              <CardDescription>Yes price over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center bg-muted/50 rounded-lg">
                <div className="text-center text-muted-foreground">
                  <svg
                    className="h-12 w-12 mx-auto mb-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                    />
                  </svg>
                  <p>Price chart coming soon</p>
                  <div className="flex justify-center gap-4 mt-4">
                    {marketData.priceHistory.map((point, i) => (
                      <div key={i} className="text-center">
                        <p className="text-xs">{point.date}</p>
                        <p className="font-medium">{(point.price * 100).toFixed(0)}¢</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Market Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total Volume</p>
                <p className="text-xl font-bold">
                  ${(marketData.totalVolume / 1000).toFixed(0)}K
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Open Interest</p>
                <p className="text-xl font-bold">
                  ${(marketData.openInterest / 1000).toFixed(0)}K
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Liquidity</p>
                <p className="text-xl font-bold">
                  ${(marketData.liquidity / 1000).toFixed(0)}K
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Closes In</p>
                <p className="text-xl font-bold">
                  {Math.ceil(
                    (new Date(marketData.closeTime).getTime() - Date.now()) /
                      (1000 * 60 * 60 * 24)
                  )}{" "}
                  days
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right: Trading Panel */}
        <div className="lg:w-96">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Place Order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Yes/No Toggle */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={orderSide === "yes" ? "default" : "outline"}
                  className={orderSide === "yes" ? "bg-green-600 hover:bg-green-700" : ""}
                  onClick={() => setOrderSide("yes")}
                >
                  <div className="text-center">
                    <p className="text-lg font-bold">Yes</p>
                    <p className="text-xs opacity-80">
                      {(marketData.yesPrice * 100).toFixed(0)}¢
                    </p>
                  </div>
                </Button>
                <Button
                  variant={orderSide === "no" ? "default" : "outline"}
                  className={orderSide === "no" ? "bg-red-600 hover:bg-red-700" : ""}
                  onClick={() => setOrderSide("no")}
                >
                  <div className="text-center">
                    <p className="text-lg font-bold">No</p>
                    <p className="text-xs opacity-80">
                      {(marketData.noPrice * 100).toFixed(0)}¢
                    </p>
                  </div>
                </Button>
              </div>

              {/* Order Type */}
              <div className="flex gap-2">
                <Button
                  variant={orderType === "market" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setOrderType("market")}
                >
                  Market
                </Button>
                <Button
                  variant={orderType === "limit" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setOrderType("limit")}
                >
                  Limit
                </Button>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-sm text-muted-foreground">Contracts</label>
                <Input
                  type="number"
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Each contract pays $1 if {orderSide.toUpperCase()} wins
                </p>
              </div>

              {/* Limit Price (if limit order) */}
              {orderType === "limit" && (
                <div>
                  <label className="text-sm text-muted-foreground">Limit Price (cents)</label>
                  <Input
                    type="number"
                    placeholder="Enter price"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    min="1"
                    max="99"
                  />
                </div>
              )}

              {/* Order Summary */}
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Price per contract</span>
                  <span>
                    {orderType === "market"
                      ? `${(currentPrice * 100).toFixed(0)}¢`
                      : limitPrice
                      ? `${parseFloat(limitPrice).toFixed(0)}¢`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Quantity</span>
                  <span>{quantity || "—"}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-medium">
                  <span>Estimated Cost</span>
                  <span>${estimatedCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Max Profit</span>
                  <span>
                    ${quantity ? (parseFloat(quantity) - estimatedCost).toFixed(2) : "—"}
                  </span>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={!quantity || parseFloat(quantity) <= 0}
              >
                {orderSide === "yes" ? "Buy Yes" : "Buy No"} — ${estimatedCost.toFixed(2)}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                By trading, you agree to our{" "}
                <Link href="/terms" className="underline">
                  Terms of Service
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Related Markets */}
      <Card>
        <CardHeader>
          <CardTitle>Related Markets</CardTitle>
          <CardDescription>Other real estate markets in this area</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                ticker: "RE-MIA-INV-Q2",
                title: "Will Miami housing inventory increase 15% by Q2?",
                yesPrice: 0.45,
              },
              {
                ticker: "RE-FL-MEDIAN-Q3",
                title: "Will Florida median price exceed $450K by Q3?",
                yesPrice: 0.72,
              },
              {
                ticker: "RE-MIA-DOM-Q2",
                title: "Will Miami days on market drop below 30 by Q2?",
                yesPrice: 0.38,
              },
            ].map((market) => (
              <Link
                key={market.ticker}
                href={`/real-estate/${market.ticker}`}
                className="block p-4 rounded-lg border hover:bg-muted transition-colors"
              >
                <p className="text-xs text-muted-foreground mb-1">
                  {market.ticker}
                </p>
                <p className="font-medium text-sm mb-2 line-clamp-2">
                  {market.title}
                </p>
                <p className="text-lg font-bold">
                  {(market.yesPrice * 100).toFixed(0)}¢
                </p>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
