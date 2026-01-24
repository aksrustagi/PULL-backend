"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pull/ui";
import { Button } from "@pull/ui";
import { Badge } from "@pull/ui";
import {
  SignalFeed,
  InsightsPanel,
  CorrelationGraph,
  type SignalData,
  type InsightData,
  type DailyBriefingData,
  type CorrelationData,
} from "@/components/signals";

// ============================================================================
// MOCK DATA (Replace with actual API calls)
// ============================================================================

const mockSignals: SignalData[] = [
  {
    _id: "sig_1",
    signalId: "sig_001",
    type: "email",
    source: "email:travel@booking.com",
    title: "Flight to Miami Detected",
    description:
      "You have a flight booking to Miami next week. Consider checking weather-related prediction markets for South Florida region.",
    confidence: 78,
    sentiment: "bullish",
    urgency: "medium",
    relatedMarkets: ["MIAMI-WEATHER-FEB", "FL-TOURISM-Q1"],
    relatedAssets: [],
    createdAt: Date.now() - 1000 * 60 * 30, // 30 mins ago
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 5, // 5 days
    userSignal: {
      relevanceScore: 85,
      seen: false,
      dismissed: false,
      actedOn: false,
    },
  },
  {
    _id: "sig_2",
    signalId: "sig_002",
    type: "market",
    source: "market:AAPL-EARNINGS",
    title: "Volume Spike: AAPL-EARNINGS",
    description:
      "Trading volume is 4.2x the 24-hour average. Unusual activity detected ahead of earnings announcement.",
    confidence: 92,
    sentiment: "neutral",
    urgency: "high",
    relatedMarkets: ["AAPL-EARNINGS-Q4", "TECH-INDEX-DEC"],
    relatedAssets: [],
    createdAt: Date.now() - 1000 * 60 * 5, // 5 mins ago
    expiresAt: Date.now() + 1000 * 60 * 60 * 6, // 6 hours
    userSignal: {
      relevanceScore: 72,
      seen: false,
      dismissed: false,
      actedOn: false,
    },
  },
  {
    _id: "sig_3",
    signalId: "sig_003",
    type: "social",
    source: "social:room_btc_general",
    title: "Bullish Consensus Forming",
    description:
      "Strong bullish sentiment detected in BTC discussion room. 15 users expressing positive outlook with 78% sentiment score.",
    confidence: 65,
    sentiment: "bullish",
    urgency: "medium",
    relatedMarkets: ["BTC-100K-2024"],
    relatedAssets: [],
    createdAt: Date.now() - 1000 * 60 * 15, // 15 mins ago
    expiresAt: Date.now() + 1000 * 60 * 60 * 2, // 2 hours
    userSignal: {
      relevanceScore: 60,
      seen: true,
      dismissed: false,
      actedOn: false,
    },
  },
  {
    _id: "sig_4",
    signalId: "sig_004",
    type: "correlation",
    source: "correlation:GOLD:INFLATION",
    title: "Strong Correlation: GOLD & INFLATION",
    description:
      "Historical correlation of 0.85 detected between gold price markets and inflation prediction markets.",
    confidence: 88,
    sentiment: "neutral",
    urgency: "low",
    relatedMarkets: ["GOLD-2000-2024", "CPI-DEC-2024"],
    relatedAssets: [],
    createdAt: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
    userSignal: {
      relevanceScore: 55,
      seen: true,
      dismissed: false,
      actedOn: false,
    },
  },
];

const mockInsights: InsightData[] = [
  {
    _id: "ins_1",
    insightType: "portfolio",
    title: "Portfolio Performance Update",
    content:
      "Your positions gained 2.3% overnight. AAPL-EARNINGS position is up 15% and approaching your target price.",
    priority: 3,
    action: "Consider taking partial profits",
    relatedMarket: "AAPL-EARNINGS-Q4",
    dismissed: false,
    createdAt: Date.now() - 1000 * 60 * 60 * 6, // 6 hours ago
  },
  {
    _id: "ins_2",
    insightType: "opportunity",
    title: "New Market Opportunity",
    content:
      "Based on your interest in technology, a new AI regulation market opened with early trading showing volatility.",
    priority: 4,
    action: "Research the market",
    relatedMarket: "AI-REG-2025",
    dismissed: false,
    createdAt: Date.now() - 1000 * 60 * 60 * 6,
  },
  {
    _id: "ins_3",
    insightType: "risk",
    title: "Position Risk Alert",
    content:
      "Your BTC-100K position has significant exposure. The market is showing increased volatility.",
    priority: 5,
    action: "Review position sizing",
    relatedMarket: "BTC-100K-2024",
    dismissed: false,
    createdAt: Date.now() - 1000 * 60 * 60 * 6,
  },
];

const mockBriefing: DailyBriefingData = {
  greeting: "Good morning!",
  summary:
    "Your portfolio is up 2.3% with 3 active positions. 2 high-priority signals require your attention.",
  insights: mockInsights,
  generatedAt: Date.now() - 1000 * 60 * 60 * 6,
};

const mockCorrelations: CorrelationData[] = [
  { market: "GOLD-2000", correlation: 0.85, sampleSize: 120, pValue: 0.001, updatedAt: Date.now() },
  { market: "USD-INDEX", correlation: -0.72, sampleSize: 90, pValue: 0.003, updatedAt: Date.now() },
  { market: "OIL-80", correlation: 0.65, sampleSize: 85, pValue: 0.01, updatedAt: Date.now() },
  { market: "TREASURY-5", correlation: -0.58, sampleSize: 100, pValue: 0.02, updatedAt: Date.now() },
];

// ============================================================================
// STATS COMPONENT
// ============================================================================

interface SignalStats {
  totalSignals: number;
  unseenSignals: number;
  highUrgencyUnseen: number;
  actedOnCount: number;
  activeInsights: number;
  actionRate: number;
}

function SignalStatsCard({ stats }: { stats: SignalStats }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Unseen Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.unseenSignals}</div>
          {stats.highUrgencyUnseen > 0 && (
            <p className="text-xs text-red-500">
              {stats.highUrgencyUnseen} high urgency
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Active Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.activeInsights}</div>
          <p className="text-xs text-muted-foreground">Personalized for you</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalSignals}</div>
          <p className="text-xs text-muted-foreground">All time</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Action Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.actionRate}%</div>
          <p className="text-xs text-muted-foreground">
            {stats.actedOnCount} signals acted on
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function AISignalsPage() {
  const router = useRouter();
  const [signals, setSignals] = useState<SignalData[]>(mockSignals);
  const [insights, setInsights] = useState<InsightData[]>(mockInsights);
  const [activeTab, setActiveTab] = useState<"signals" | "insights" | "correlations">(
    "signals"
  );

  // Mock stats
  const stats: SignalStats = {
    totalSignals: signals.length,
    unseenSignals: signals.filter((s) => !s.userSignal?.seen).length,
    highUrgencyUnseen: signals.filter(
      (s) => s.urgency === "high" && !s.userSignal?.seen
    ).length,
    actedOnCount: signals.filter((s) => s.userSignal?.actedOn).length,
    activeInsights: insights.filter((i) => !i.dismissed).length,
    actionRate: Math.round(
      (signals.filter((s) => s.userSignal?.actedOn).length / signals.length) * 100
    ),
  };

  const handleDismissSignal = useCallback((signalId: string) => {
    setSignals((prev) =>
      prev.map((s) =>
        s._id === signalId
          ? { ...s, userSignal: { ...s.userSignal!, dismissed: true } }
          : s
      )
    );
    // TODO: Call API to dismiss signal
  }, []);

  const handleMarkActed = useCallback((signalId: string) => {
    setSignals((prev) =>
      prev.map((s) =>
        s._id === signalId
          ? { ...s, userSignal: { ...s.userSignal!, actedOn: true, seen: true } }
          : s
      )
    );
    // TODO: Call API to mark signal as acted
  }, []);

  const handleDismissInsight = useCallback((insightId: string) => {
    setInsights((prev) =>
      prev.map((i) => (i._id === insightId ? { ...i, dismissed: true } : i))
    );
    // TODO: Call API to dismiss insight
  }, []);

  const handleViewMarket = useCallback(
    (ticker: string) => {
      router.push(`/trade/${ticker}`);
    },
    [router]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">AI Signals</h1>
          <p className="text-muted-foreground">
            AI-powered trading signals and personalized insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/ai-signals/preferences">Preferences</Link>
          </Button>
          <Button variant="outline">Refresh</Button>
        </div>
      </div>

      {/* Stats */}
      <SignalStatsCard stats={stats} />

      {/* Tab navigation */}
      <div className="flex space-x-1 border-b">
        <button
          onClick={() => setActiveTab("signals")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "signals"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Signals
          {stats.unseenSignals > 0 && (
            <Badge variant="destructive" className="ml-2">
              {stats.unseenSignals}
            </Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab("insights")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "insights"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Insights
          {stats.activeInsights > 0 && (
            <Badge variant="secondary" className="ml-2">
              {stats.activeInsights}
            </Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab("correlations")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "correlations"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Correlations
        </button>
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === "signals" && (
          <SignalFeed
            signals={signals.filter((s) => !s.userSignal?.dismissed)}
            onDismiss={handleDismissSignal}
            onMarkActed={handleMarkActed}
            onViewMarket={handleViewMarket}
            showFilters
            emptyMessage="No active signals. Check back later for new trading opportunities."
          />
        )}

        {activeTab === "insights" && (
          <InsightsPanel
            briefing={mockBriefing}
            insights={insights}
            onDismiss={handleDismissInsight}
            onViewMarket={handleViewMarket}
          />
        )}

        {activeTab === "correlations" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Market Correlations</CardTitle>
                <CardDescription>
                  Explore statistical relationships between prediction markets
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-6">
                  <label className="text-sm text-muted-foreground">
                    Select market:
                  </label>
                  <select className="border rounded px-3 py-2 bg-background">
                    <option value="CPI-DEC-2024">CPI-DEC-2024</option>
                    <option value="AAPL-EARNINGS-Q4">AAPL-EARNINGS-Q4</option>
                    <option value="BTC-100K-2024">BTC-100K-2024</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            <CorrelationGraph
              centerMarket="CPI-DEC-2024"
              correlations={mockCorrelations}
              onSelectMarket={handleViewMarket}
            />
          </div>
        )}
      </div>

      {/* Privacy notice */}
      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              AI signals are generated based on your preferences and activity.{" "}
              <Link href="/ai-signals/preferences" className="text-primary hover:underline">
                Manage privacy settings
              </Link>
            </p>
            <Badge variant="outline" className="text-xs">
              Email analysis: Off
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
