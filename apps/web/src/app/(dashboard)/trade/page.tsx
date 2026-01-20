"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pull/ui";
import { Button } from "@pull/ui";
import { Input } from "@pull/ui";
import { Badge } from "@pull/ui";

// Categories
const categories = [
  { id: "all", name: "All Markets" },
  { id: "politics", name: "Politics" },
  { id: "sports", name: "Sports" },
  { id: "finance", name: "Finance" },
  { id: "crypto", name: "Crypto" },
  { id: "entertainment", name: "Entertainment" },
  { id: "science", name: "Science" },
];

// Placeholder markets
const markets = [
  {
    ticker: "PRES24",
    title: "Will the Democratic candidate win the 2024 Presidential Election?",
    category: "politics",
    lastPrice: 0.48,
    volume: 125000,
    change: 2.5,
    closesAt: "2024-11-05T00:00:00Z",
  },
  {
    ticker: "BTCNEW",
    title: "Will Bitcoin reach a new all-time high in 2024?",
    category: "crypto",
    lastPrice: 0.65,
    volume: 89000,
    change: -1.2,
    closesAt: "2024-12-31T00:00:00Z",
  },
  {
    ticker: "SBLVIII",
    title: "Will the Kansas City Chiefs win Super Bowl LVIII?",
    category: "sports",
    lastPrice: 0.32,
    volume: 45000,
    change: 5.1,
    closesAt: "2024-02-11T00:00:00Z",
  },
];

export default function TradePage() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredMarkets = markets.filter((market) => {
    const matchesCategory =
      selectedCategory === "all" || market.category === selectedCategory;
    const matchesSearch =
      market.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      market.ticker.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Markets</h1>
        <p className="text-muted-foreground">
          Trade prediction markets on real-world events
        </p>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <Input
            placeholder="Search markets..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <Button
            key={category.id}
            variant={selectedCategory === category.id ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(category.id)}
          >
            {category.name}
          </Button>
        ))}
      </div>

      {/* Featured markets */}
      <Card>
        <CardHeader>
          <CardTitle>Featured Markets</CardTitle>
          <CardDescription>High-volume markets with significant activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMarkets.slice(0, 3).map((market) => (
              <Link
                key={market.ticker}
                href={`/trade/${market.ticker}`}
                className="block p-4 rounded-lg border bg-card hover:bg-muted transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <Badge variant="outline">{market.category}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {market.ticker}
                  </span>
                </div>
                <h3 className="font-medium text-sm mb-3 line-clamp-2">
                  {market.title}
                </h3>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-bold">
                      {(market.lastPrice * 100).toFixed(0)}¢
                    </p>
                    <p
                      className={`text-xs ${
                        market.change >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {market.change >= 0 ? "+" : ""}
                      {market.change.toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Volume</p>
                    <p className="text-sm font-medium">
                      ${(market.volume / 1000).toFixed(0)}k
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* All markets table */}
      <Card>
        <CardHeader>
          <CardTitle>All Markets</CardTitle>
          <CardDescription>
            {filteredMarkets.length} markets found
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 font-medium text-muted-foreground">Market</th>
                  <th className="pb-3 font-medium text-muted-foreground text-right">Price</th>
                  <th className="pb-3 font-medium text-muted-foreground text-right hidden sm:table-cell">
                    24h Change
                  </th>
                  <th className="pb-3 font-medium text-muted-foreground text-right hidden md:table-cell">
                    Volume
                  </th>
                  <th className="pb-3 font-medium text-muted-foreground text-right hidden lg:table-cell">
                    Closes
                  </th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredMarkets.map((market) => (
                  <tr key={market.ticker} className="border-b last:border-0">
                    <td className="py-4">
                      <div className="flex items-center space-x-3">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                          {market.ticker.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate max-w-[300px]">
                            {market.title}
                          </p>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-muted-foreground">
                              {market.ticker}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {market.category}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 text-right font-medium">
                      {(market.lastPrice * 100).toFixed(0)}¢
                    </td>
                    <td
                      className={`py-4 text-right hidden sm:table-cell ${
                        market.change >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {market.change >= 0 ? "+" : ""}
                      {market.change.toFixed(1)}%
                    </td>
                    <td className="py-4 text-right hidden md:table-cell text-muted-foreground">
                      ${(market.volume / 1000).toFixed(0)}k
                    </td>
                    <td className="py-4 text-right hidden lg:table-cell text-muted-foreground text-sm">
                      {new Date(market.closesAt).toLocaleDateString()}
                    </td>
                    <td className="py-4 text-right">
                      <Button size="sm" asChild>
                        <Link href={`/trade/${market.ticker}`}>Trade</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredMarkets.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>No markets found matching your criteria</p>
              <Button
                variant="link"
                onClick={() => {
                  setSelectedCategory("all");
                  setSearchQuery("");
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
