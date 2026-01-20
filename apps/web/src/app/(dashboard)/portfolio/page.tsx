"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pull/ui";
import { Button } from "@pull/ui";
import { Badge } from "@pull/ui";

// Tabs
const tabs = [
  { id: "positions", name: "Positions" },
  { id: "orders", name: "Open Orders" },
  { id: "history", name: "Trade History" },
];

// Placeholder data
const portfolioSummary = {
  totalValue: 0,
  cashBalance: 0,
  positionsValue: 0,
  dayChange: 0,
  dayChangePercent: 0,
  totalPnl: 0,
  totalPnlPercent: 0,
};

const positions: Array<{
  id: string;
  ticker: string;
  title: string;
  side: "yes" | "no";
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
}> = [];

const openOrders: Array<{
  id: string;
  ticker: string;
  side: "buy" | "sell";
  outcome: "yes" | "no";
  type: "limit" | "market";
  quantity: number;
  price: number;
  filled: number;
  status: string;
  createdAt: string;
}> = [];

const tradeHistory: Array<{
  id: string;
  ticker: string;
  side: "buy" | "sell";
  outcome: "yes" | "no";
  quantity: number;
  price: number;
  total: number;
  executedAt: string;
}> = [];

export default function PortfolioPage() {
  const [activeTab, setActiveTab] = useState("positions");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Portfolio</h1>
          <p className="text-muted-foreground">
            Manage your positions and orders
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/funds">Deposit</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/funds?tab=withdraw">Withdraw</Link>
          </Button>
        </div>
      </div>

      {/* Portfolio summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Portfolio Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ${portfolioSummary.totalValue.toFixed(2)}
            </p>
            <p
              className={`text-xs ${
                portfolioSummary.dayChangePercent >= 0
                  ? "text-green-500"
                  : "text-red-500"
              }`}
            >
              {portfolioSummary.dayChangePercent >= 0 ? "+" : ""}
              ${portfolioSummary.dayChange.toFixed(2)} (
              {portfolioSummary.dayChangePercent.toFixed(2)}%) today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cash Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ${portfolioSummary.cashBalance.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">Available to trade</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Positions Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ${portfolioSummary.positionsValue.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              {positions.length} open positions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total P&L
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                portfolioSummary.totalPnl >= 0 ? "text-green-500" : "text-red-500"
              }`}
            >
              {portfolioSummary.totalPnl >= 0 ? "+" : ""}$
              {portfolioSummary.totalPnl.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              {portfolioSummary.totalPnlPercent.toFixed(2)}% all time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performance chart placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Performance</CardTitle>
          <CardDescription>Your portfolio value over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center bg-muted rounded-lg">
            <p className="text-muted-foreground">
              Performance chart will appear here once you have trading activity
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "positions" && (
        <Card>
          <CardContent className="pt-6">
            {positions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium text-muted-foreground">
                        Market
                      </th>
                      <th className="pb-3 font-medium text-muted-foreground">
                        Side
                      </th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">
                        Quantity
                      </th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">
                        Avg Price
                      </th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">
                        Current
                      </th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">
                        P&L
                      </th>
                      <th className="pb-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((position) => (
                      <tr key={position.id} className="border-b last:border-0">
                        <td className="py-4">
                          <div>
                            <p className="font-medium">{position.ticker}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {position.title}
                            </p>
                          </div>
                        </td>
                        <td className="py-4">
                          <Badge
                            variant={
                              position.side === "yes" ? "default" : "secondary"
                            }
                          >
                            {position.side.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="py-4 text-right">{position.quantity}</td>
                        <td className="py-4 text-right">
                          {(position.avgPrice * 100).toFixed(0)}¢
                        </td>
                        <td className="py-4 text-right">
                          {(position.currentPrice * 100).toFixed(0)}¢
                        </td>
                        <td
                          className={`py-4 text-right ${
                            position.pnl >= 0 ? "text-green-500" : "text-red-500"
                          }`}
                        >
                          {position.pnl >= 0 ? "+" : ""}${position.pnl.toFixed(2)}
                          <br />
                          <span className="text-xs">
                            ({position.pnlPercent.toFixed(1)}%)
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/trade/${position.ticker}`}>Trade</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p className="mb-4">No open positions</p>
                <Button asChild>
                  <Link href="/trade">Start Trading</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "orders" && (
        <Card>
          <CardContent className="pt-6">
            {openOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium text-muted-foreground">
                        Market
                      </th>
                      <th className="pb-3 font-medium text-muted-foreground">
                        Type
                      </th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">
                        Qty
                      </th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">
                        Price
                      </th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">
                        Filled
                      </th>
                      <th className="pb-3 font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="pb-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {openOrders.map((order) => (
                      <tr key={order.id} className="border-b last:border-0">
                        <td className="py-4 font-medium">{order.ticker}</td>
                        <td className="py-4">
                          <span
                            className={
                              order.side === "buy"
                                ? "text-green-500"
                                : "text-red-500"
                            }
                          >
                            {order.side.toUpperCase()}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            {order.outcome.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-4 text-right">{order.quantity}</td>
                        <td className="py-4 text-right">
                          {(order.price * 100).toFixed(0)}¢
                        </td>
                        <td className="py-4 text-right">{order.filled}</td>
                        <td className="py-4">
                          <Badge variant="outline">{order.status}</Badge>
                        </td>
                        <td className="py-4 text-right">
                          <Button size="sm" variant="destructive">
                            Cancel
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No open orders</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "history" && (
        <Card>
          <CardContent className="pt-6">
            {tradeHistory.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium text-muted-foreground">
                        Date
                      </th>
                      <th className="pb-3 font-medium text-muted-foreground">
                        Market
                      </th>
                      <th className="pb-3 font-medium text-muted-foreground">
                        Type
                      </th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">
                        Qty
                      </th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">
                        Price
                      </th>
                      <th className="pb-3 font-medium text-muted-foreground text-right">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradeHistory.map((trade) => (
                      <tr key={trade.id} className="border-b last:border-0">
                        <td className="py-4 text-muted-foreground">
                          {new Date(trade.executedAt).toLocaleDateString()}
                        </td>
                        <td className="py-4 font-medium">{trade.ticker}</td>
                        <td className="py-4">
                          <span
                            className={
                              trade.side === "buy"
                                ? "text-green-500"
                                : "text-red-500"
                            }
                          >
                            {trade.side.toUpperCase()}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            {trade.outcome.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-4 text-right">{trade.quantity}</td>
                        <td className="py-4 text-right">
                          {(trade.price * 100).toFixed(0)}¢
                        </td>
                        <td className="py-4 text-right">
                          ${trade.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No trade history yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
