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

// Real estate market categories
const categories = [
  { id: "all", name: "All Markets", icon: "grid" },
  { id: "median_price", name: "Home Prices", icon: "dollar-sign" },
  { id: "mortgage_rates", name: "Mortgage Rates", icon: "percent" },
  { id: "housing_inventory", name: "Inventory", icon: "home" },
  { id: "rent_prices", name: "Rent Prices", icon: "key" },
  { id: "development_sellout", name: "Developments", icon: "building" },
  { id: "new_construction", name: "New Construction", icon: "hammer" },
];

// Geographic scope filters
const scopes = [
  { id: "all", name: "All Locations" },
  { id: "national", name: "National" },
  { id: "state", name: "State" },
  { id: "metro", name: "Metro" },
  { id: "city", name: "City" },
];

// Placeholder markets
const markets = [
  {
    ticker: "RE-MIA-MEDIAN-Q2",
    title: "Will median home price in Miami exceed $600K by Q2 2025?",
    category: "median_price",
    scope: "city",
    location: "Miami, FL",
    yesPrice: 0.65,
    volume: 185000,
    change: 3.2,
    targetValue: 600000,
    currentValue: 582000,
    closesAt: "2025-06-30T23:59:59Z",
    status: "open",
  },
  {
    ticker: "RE-RATE-30Y-6PCT",
    title: "Will 30-year mortgage rates drop below 6% by year end?",
    category: "mortgage_rates",
    scope: "national",
    location: "US",
    yesPrice: 0.42,
    volume: 320000,
    change: -1.8,
    targetValue: 6.0,
    currentValue: 6.75,
    closesAt: "2025-12-31T23:59:59Z",
    status: "open",
  },
  {
    ticker: "RE-ATX-INV-20",
    title: "Will housing inventory in Austin increase 20% by Q3?",
    category: "housing_inventory",
    scope: "city",
    location: "Austin, TX",
    yesPrice: 0.58,
    volume: 95000,
    change: 5.4,
    targetValue: 20,
    currentValue: 12.5,
    closesAt: "2025-09-30T23:59:59Z",
    status: "open",
  },
  {
    ticker: "RE-SF-SQFT-1500",
    title: "Will SF price per sqft exceed $1,500 by end of 2025?",
    category: "median_price",
    scope: "city",
    location: "San Francisco, CA",
    yesPrice: 0.35,
    volume: 78000,
    change: -2.1,
    targetValue: 1500,
    currentValue: 1380,
    closesAt: "2025-12-31T23:59:59Z",
    status: "open",
  },
  {
    ticker: "RE-PHX-DOM-25",
    title: "Will Phoenix avg days on market drop below 25 days?",
    category: "days_on_market",
    scope: "city",
    location: "Phoenix, AZ",
    yesPrice: 0.72,
    volume: 62000,
    change: 4.8,
    targetValue: 25,
    currentValue: 28,
    closesAt: "2025-06-30T23:59:59Z",
    status: "open",
  },
];

// PULL Real Estate Index data
const pullIndex = {
  ticker: "PULL-RE-US",
  name: "PULL Real Estate Index",
  value: 1245.67,
  change: 13.22,
  changePercent: 1.07,
  trend: "up" as const,
  sentiment: 65,
};

export default function RealEstateMarketsPage() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedScope, setSelectedScope] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredMarkets = markets.filter((market) => {
    const matchesCategory =
      selectedCategory === "all" || market.category === selectedCategory;
    const matchesScope =
      selectedScope === "all" || market.scope === selectedScope;
    const matchesSearch =
      market.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      market.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
      market.location.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesScope && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Real Estate Markets</h1>
          <p className="text-muted-foreground">
            Trade prediction markets on housing trends, prices, and inventory
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/real-estate/sentiment">Market Sentiment</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/agent">Agent Portal</Link>
          </Button>
        </div>
      </div>

      {/* PULL Index Banner */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="py-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-xl bg-primary/20 flex items-center justify-center">
                <svg
                  className="h-7 w-7 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{pullIndex.name}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">
                    {pullIndex.value.toLocaleString()}
                  </span>
                  <Badge
                    variant={pullIndex.trend === "up" ? "default" : "destructive"}
                    className="text-xs"
                  >
                    {pullIndex.trend === "up" ? "+" : ""}
                    {pullIndex.changePercent.toFixed(2)}%
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Market Sentiment</p>
                <div className="flex items-center gap-1">
                  <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${pullIndex.sentiment}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{pullIndex.sentiment}</span>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/real-estate/index">View Index Details</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
            placeholder="Search markets, locations, or tickers..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2 border rounded-md bg-background text-sm"
          value={selectedScope}
          onChange={(e) => setSelectedScope(e.target.value)}
        >
          {scopes.map((scope) => (
            <option key={scope.id} value={scope.id}>
              {scope.name}
            </option>
          ))}
        </select>
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
          <CardTitle>Trending Markets</CardTitle>
          <CardDescription>
            High-volume real estate prediction markets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMarkets.slice(0, 3).map((market) => (
              <Link
                key={market.ticker}
                href={`/real-estate/${market.ticker}`}
                className="block p-4 rounded-lg border bg-card hover:bg-muted transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <Badge variant="outline" className="text-xs">
                    {market.location}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {market.ticker}
                  </span>
                </div>
                <h3 className="font-medium text-sm mb-3 line-clamp-2">
                  {market.title}
                </h3>

                {/* Progress towards target */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Current: {formatValue(market.currentValue, market.category)}</span>
                    <span>Target: {formatValue(market.targetValue, market.category)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: `${Math.min(100, (market.currentValue / market.targetValue) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Yes Price</p>
                    <p className="text-2xl font-bold">
                      {(market.yesPrice * 100).toFixed(0)}¢
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
                    <p className="text-xs text-muted-foreground">
                      Closes {new Date(market.closesAt).toLocaleDateString()}
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
          <CardTitle>All Real Estate Markets</CardTitle>
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
                  <th className="pb-3 font-medium text-muted-foreground text-right">
                    Yes Price
                  </th>
                  <th className="pb-3 font-medium text-muted-foreground text-right hidden sm:table-cell">
                    24h Change
                  </th>
                  <th className="pb-3 font-medium text-muted-foreground text-right hidden md:table-cell">
                    Volume
                  </th>
                  <th className="pb-3 font-medium text-muted-foreground text-right hidden lg:table-cell">
                    Progress
                  </th>
                  <th className="pb-3 font-medium text-muted-foreground text-right hidden xl:table-cell">
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
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <CategoryIcon category={market.category} />
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
                              {market.location}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 text-right font-medium">
                      {(market.yesPrice * 100).toFixed(0)}¢
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
                    <td className="py-4 text-right hidden lg:table-cell">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{
                              width: `${Math.min(100, (market.currentValue / market.targetValue) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-10 text-right">
                          {Math.round((market.currentValue / market.targetValue) * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-4 text-right hidden xl:table-cell text-muted-foreground text-sm">
                      {new Date(market.closesAt).toLocaleDateString()}
                    </td>
                    <td className="py-4 text-right">
                      <Button size="sm" asChild>
                        <Link href={`/real-estate/${market.ticker}`}>Trade</Link>
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
                  setSelectedScope("all");
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

// Helper to format values based on category
function formatValue(value: number, category: string): string {
  switch (category) {
    case "median_price":
      return `$${(value / 1000).toFixed(0)}K`;
    case "mortgage_rates":
      return `${value.toFixed(2)}%`;
    case "housing_inventory":
      return `${value.toFixed(1)}%`;
    case "days_on_market":
      return `${value} days`;
    default:
      return value.toLocaleString();
  }
}

// Category icon component
function CategoryIcon({ category }: { category: string }) {
  const icons: Record<string, JSX.Element> = {
    median_price: (
      <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    mortgage_rates: (
      <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    ),
    housing_inventory: (
      <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    days_on_market: (
      <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    default: (
      <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  };

  return icons[category] ?? icons.default;
}
