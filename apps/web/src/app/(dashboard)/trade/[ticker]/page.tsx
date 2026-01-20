"use client";

import { useState } from "react";
import Link from "next/link";
import { use } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pull/ui";
import { Button } from "@pull/ui";
import { Input } from "@pull/ui";
import { Badge } from "@pull/ui";

interface TradingViewPageProps {
  params: Promise<{ ticker: string }>;
}

export default function TradingViewPage({ params }: TradingViewPageProps) {
  const { ticker } = use(params);
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");

  // Placeholder market data
  const market = {
    ticker,
    title: `Will event ${ticker} happen?`,
    description:
      "This is a placeholder description for the prediction market. It would contain details about the event, resolution criteria, and other relevant information.",
    category: "politics",
    status: "open",
    lastPrice: 0.52,
    yesPrice: 0.52,
    noPrice: 0.48,
    volume24h: 45000,
    totalVolume: 250000,
    change24h: 3.2,
    closesAt: "2024-12-31T00:00:00Z",
    createdAt: "2024-01-01T00:00:00Z",
  };

  // Placeholder orderbook
  const orderbook = {
    bids: [
      { price: 0.51, size: 500 },
      { price: 0.50, size: 1200 },
      { price: 0.49, size: 800 },
      { price: 0.48, size: 2000 },
      { price: 0.47, size: 1500 },
    ],
    asks: [
      { price: 0.52, size: 600 },
      { price: 0.53, size: 900 },
      { price: 0.54, size: 1100 },
      { price: 0.55, size: 700 },
      { price: 0.56, size: 1800 },
    ],
  };

  // Calculate estimated cost
  const estimatedCost = () => {
    const qty = parseFloat(quantity) || 0;
    const price =
      orderType === "limit"
        ? parseFloat(limitPrice) || 0
        : side === "yes"
        ? market.yesPrice
        : market.noPrice;
    return (qty * price).toFixed(2);
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
        <Link href="/trade" className="hover:text-foreground">
          Markets
        </Link>
        <span>/</span>
        <span className="text-foreground">{ticker}</span>
      </div>

      {/* Market header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <Badge variant="outline">{market.category}</Badge>
            <Badge
              variant={market.status === "open" ? "default" : "secondary"}
            >
              {market.status}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold mb-2">{market.title}</h1>
          <p className="text-muted-foreground text-sm">{market.description}</p>
        </div>
        <div className="flex items-center space-x-6 lg:text-right">
          <div>
            <p className="text-sm text-muted-foreground">Last Price</p>
            <p className="text-3xl font-bold">
              {(market.lastPrice * 100).toFixed(0)}¢
            </p>
            <p
              className={`text-sm ${
                market.change24h >= 0 ? "text-green-500" : "text-red-500"
              }`}
            >
              {market.change24h >= 0 ? "+" : ""}
              {market.change24h.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">24h Volume</p>
            <p className="text-xl font-medium">
              ${(market.volume24h / 1000).toFixed(0)}k
            </p>
          </div>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Chart area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Price chart placeholder */}
          <Card>
            <CardHeader>
              <CardTitle>Price Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex items-center justify-center bg-muted rounded-lg">
                <p className="text-muted-foreground">Chart placeholder</p>
              </div>
            </CardContent>
          </Card>

          {/* Orderbook */}
          <Card>
            <CardHeader>
              <CardTitle>Order Book</CardTitle>
              <CardDescription>
                Spread: {((market.yesPrice - (1 - market.noPrice)) * 100).toFixed(1)}¢
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {/* Bids */}
                <div>
                  <p className="text-sm font-medium text-green-500 mb-2">Bids (Yes)</p>
                  <div className="space-y-1">
                    {orderbook.bids.map((bid, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between text-sm relative"
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-green-500/10 rounded"
                          style={{ width: `${(bid.size / 2000) * 100}%` }}
                        />
                        <span className="relative text-green-500">
                          {(bid.price * 100).toFixed(0)}¢
                        </span>
                        <span className="relative text-muted-foreground">
                          {bid.size}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Asks */}
                <div>
                  <p className="text-sm font-medium text-red-500 mb-2">Asks (No)</p>
                  <div className="space-y-1">
                    {orderbook.asks.map((ask, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between text-sm relative"
                      >
                        <div
                          className="absolute inset-y-0 right-0 bg-red-500/10 rounded"
                          style={{ width: `${(ask.size / 2000) * 100}%` }}
                        />
                        <span className="relative text-red-500">
                          {(ask.price * 100).toFixed(0)}¢
                        </span>
                        <span className="relative text-muted-foreground">
                          {ask.size}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Order form */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Place Order</CardTitle>
              <CardDescription>Trade {ticker} contracts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Side selection */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={side === "yes" ? "default" : "outline"}
                  className={side === "yes" ? "bg-green-600 hover:bg-green-700" : ""}
                  onClick={() => setSide("yes")}
                >
                  Yes {(market.yesPrice * 100).toFixed(0)}¢
                </Button>
                <Button
                  variant={side === "no" ? "default" : "outline"}
                  className={side === "no" ? "bg-red-600 hover:bg-red-700" : ""}
                  onClick={() => setSide("no")}
                >
                  No {(market.noPrice * 100).toFixed(0)}¢
                </Button>
              </div>

              {/* Order type */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Order Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={orderType === "market" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOrderType("market")}
                  >
                    Market
                  </Button>
                  <Button
                    variant={orderType === "limit" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOrderType("limit")}
                  >
                    Limit
                  </Button>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Quantity (contracts)
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    placeholder="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-xs"
                    onClick={() => setQuantity("100")}
                  >
                    Max
                  </Button>
                </div>
              </div>

              {/* Limit price (if limit order) */}
              {orderType === "limit" && (
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Limit Price (¢)
                  </label>
                  <Input
                    type="number"
                    placeholder="0"
                    min="1"
                    max="99"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                  />
                </div>
              )}

              {/* Order summary */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Estimated Cost</span>
                  <span className="font-medium">${estimatedCost()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Max Payout</span>
                  <span className="font-medium">
                    ${(parseFloat(quantity) || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Submit */}
              <Button
                className={`w-full ${
                  side === "yes"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
                disabled={!quantity || parseFloat(quantity) <= 0}
              >
                {side === "yes" ? "Buy Yes" : "Buy No"}
              </Button>
            </CardContent>
          </Card>

          {/* Your position */}
          <Card>
            <CardHeader>
              <CardTitle>Your Position</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-4 text-muted-foreground">
                <p>No position in this market</p>
              </div>
            </CardContent>
          </Card>

          {/* Market details */}
          <Card>
            <CardHeader>
              <CardTitle>Market Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Volume</span>
                <span>${(market.totalVolume / 1000).toFixed(0)}k</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(market.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Closes</span>
                <span>{new Date(market.closesAt).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
