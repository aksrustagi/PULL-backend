"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pull/ui";
import { Button } from "@pull/ui";

// Quick stats data (would come from API)
const stats = [
  { label: "Portfolio Value", value: "$0.00", change: "+0.00%", positive: true },
  { label: "Day P&L", value: "$0.00", change: "0.00%", positive: true },
  { label: "Points Balance", value: "0", change: null, positive: true },
  { label: "Open Positions", value: "0", change: null, positive: true },
];

// Quick actions
const quickActions = [
  { name: "Trade Markets", href: "/trade", icon: "📈" },
  { name: "View Portfolio", href: "/portfolio", icon: "💼" },
  { name: "Browse Collectibles", href: "/collectibles", icon: "🃏" },
  { name: "Check Rewards", href: "/rewards", icon: "🎁" },
];

// Recent activity (placeholder)
const recentActivity = [
  { id: 1, type: "trade", description: "No recent activity", timestamp: "" },
];

// Market movers (placeholder)
const marketMovers = [
  { ticker: "---", name: "No markets available", price: 0, change: 0 },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Welcome section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Welcome back!</h1>
          <p className="text-muted-foreground">
            Here's what's happening with your account today.
          </p>
        </div>
        <Button asChild>
          <Link href="/trade">Start Trading</Link>
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              {stat.change && (
                <p
                  className={`text-xs ${
                    stat.positive ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {stat.change}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quick actions */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Jump to your favorite features</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <Link
                key={action.name}
                href={action.href}
                className="flex flex-col items-center justify-center p-4 rounded-lg border bg-card hover:bg-muted transition-colors text-center"
              >
                <span className="text-2xl mb-2">{action.icon}</span>
                <span className="text-sm font-medium">{action.name}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Market movers */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Market Movers</CardTitle>
              <CardDescription>Top performing markets today</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/trade">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {marketMovers.map((market, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                      {market.ticker.slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{market.ticker}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {market.name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {market.price > 0 ? `$${market.price.toFixed(2)}` : "---"}
                    </p>
                    <p
                      className={`text-xs ${
                        market.change >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {market.change >= 0 ? "+" : ""}
                      {market.change.toFixed(2)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity and upcoming events */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest transactions and trades</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length > 0 && recentActivity[0].timestamp ? (
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center space-x-4">
                    <div className="h-8 w-8 rounded-full bg-muted" />
                    <div className="flex-1">
                      <p className="text-sm">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">{activity.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No recent activity</p>
                <Button variant="link" asChild className="mt-2">
                  <Link href="/trade">Make your first trade</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming events */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Events</CardTitle>
            <CardDescription>Events resolving soon</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <p>No upcoming events</p>
              <Button variant="link" asChild className="mt-2">
                <Link href="/predictions">Browse predictions</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
