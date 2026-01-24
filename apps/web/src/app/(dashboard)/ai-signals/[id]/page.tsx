"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pull/ui";
import { Button } from "@pull/ui";
import { Badge } from "@pull/ui";

// ============================================================================
// TYPES
// ============================================================================

interface SignalDetail {
  _id: string;
  signalId: string;
  type: "email" | "social" | "market" | "news" | "correlation";
  source: string;
  title: string;
  description: string;
  confidence: number;
  sentiment: "bullish" | "bearish" | "neutral";
  urgency: "low" | "medium" | "high";
  relatedMarkets: string[];
  relatedAssets: string[];
  metadata?: Record<string, unknown>;
  expiresAt?: number;
  createdAt: number;
  userSignal?: {
    relevanceScore: number;
    seen: boolean;
    dismissed: boolean;
    actedOn: boolean;
  };
  markets?: Array<{
    ticker: string;
    title: string;
    probability: number;
    volume24h: number;
  }>;
}

// ============================================================================
// MOCK DATA
// ============================================================================

const mockSignal: SignalDetail = {
  _id: "sig_1",
  signalId: "sig_001",
  type: "email",
  source: "email:travel@booking.com",
  title: "Flight to Miami Detected",
  description:
    "Your email shows a flight booking confirmation to Miami for next week. This could be relevant to weather-related prediction markets for South Florida, as well as tourism and event markets in the region. Consider checking current market conditions before your trip.",
  confidence: 78,
  sentiment: "bullish",
  urgency: "medium",
  relatedMarkets: ["MIAMI-WEATHER-FEB", "FL-TOURISM-Q1", "SUPER-BOWL-2024"],
  relatedAssets: [],
  metadata: {
    emailId: "email_12345",
    emailSubject: "Your Flight Confirmation to Miami",
    signalSubType: "travel",
    reasoning:
      "Travel bookings indicate potential interest in destination-related markets. Miami in February suggests interest in weather markets and major events.",
    departureDate: "2024-02-15",
    returnDate: "2024-02-20",
  },
  expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 5,
  createdAt: Date.now() - 1000 * 60 * 30,
  userSignal: {
    relevanceScore: 85,
    seen: true,
    dismissed: false,
    actedOn: false,
  },
  markets: [
    {
      ticker: "MIAMI-WEATHER-FEB",
      title: "Will it rain in Miami on Feb 15?",
      probability: 0.35,
      volume24h: 15420,
    },
    {
      ticker: "FL-TOURISM-Q1",
      title: "Florida tourism to exceed 30M visitors in Q1",
      probability: 0.62,
      volume24h: 8750,
    },
    {
      ticker: "SUPER-BOWL-2024",
      title: "Super Bowl 2024 total viewership over 120M",
      probability: 0.71,
      volume24h: 125000,
    },
  ],
};

// ============================================================================
// HELPERS
// ============================================================================

function getTypeLabel(type: SignalDetail["type"]): string {
  const labels = {
    email: "Email Signal",
    social: "Social Sentiment",
    market: "Market Anomaly",
    news: "News Signal",
    correlation: "Correlation",
  };
  return labels[type];
}

function getSentimentColor(sentiment: string): string {
  switch (sentiment) {
    case "bullish":
      return "text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900";
    case "bearish":
      return "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900";
    default:
      return "text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900";
  }
}

function getUrgencyVariant(
  urgency: string
): "default" | "secondary" | "destructive" {
  switch (urgency) {
    case "high":
      return "destructive";
    case "medium":
      return "default";
    default:
      return "secondary";
  }
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default function SignalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const signalId = params.id as string;

  // TODO: Fetch signal from API
  const signal = mockSignal;
  const isLoading = false;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold mb-4">Signal Not Found</h1>
        <p className="text-muted-foreground mb-6">
          The signal you're looking for doesn't exist or has expired.
        </p>
        <Button asChild>
          <Link href="/ai-signals">Back to Signals</Link>
        </Button>
      </div>
    );
  }

  const timeAgo = formatDistanceToNow(new Date(signal.createdAt), {
    addSuffix: true,
  });

  const expiresIn = signal.expiresAt
    ? formatDistanceToNow(new Date(signal.expiresAt), { addSuffix: false })
    : null;

  const isExpired = signal.expiresAt ? Date.now() > signal.expiresAt : false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{signal.title}</h1>
            <p className="text-sm text-muted-foreground">
              {getTypeLabel(signal.type)} - {timeAgo}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant={getUrgencyVariant(signal.urgency)}>
            {signal.urgency} urgency
          </Badge>
          <Badge className={getSentimentColor(signal.sentiment)}>
            {signal.sentiment}
          </Badge>
        </div>
      </div>

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Signal details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Signal Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">{signal.description}</p>

              {/* Confidence meter */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Confidence</span>
                  <span className="font-medium">{signal.confidence}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      signal.confidence >= 80
                        ? "bg-green-500"
                        : signal.confidence >= 60
                          ? "bg-yellow-500"
                          : "bg-gray-400"
                    }`}
                    style={{ width: `${signal.confidence}%` }}
                  />
                </div>
              </div>

              {/* Expiration */}
              {expiresIn && !isExpired && (
                <div className="flex items-center justify-between text-sm p-3 bg-muted/50 rounded-lg">
                  <span className="text-muted-foreground">Expires in</span>
                  <span className="font-medium">{expiresIn}</span>
                </div>
              )}
              {isExpired && (
                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400 text-sm">
                  This signal has expired
                </div>
              )}
            </CardContent>
          </Card>

          {/* Metadata */}
          {signal.metadata && (
            <Card>
              <CardHeader>
                <CardTitle>Additional Context</CardTitle>
                <CardDescription>
                  Source-specific information about this signal
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4">
                  {signal.metadata.reasoning && (
                    <div className="col-span-2">
                      <dt className="text-sm text-muted-foreground">
                        Reasoning
                      </dt>
                      <dd className="text-sm mt-1">
                        {signal.metadata.reasoning as string}
                      </dd>
                    </div>
                  )}
                  {signal.metadata.signalSubType && (
                    <div>
                      <dt className="text-sm text-muted-foreground">
                        Signal Type
                      </dt>
                      <dd className="text-sm mt-1 font-medium capitalize">
                        {signal.metadata.signalSubType as string}
                      </dd>
                    </div>
                  )}
                  {signal.metadata.departureDate && (
                    <div>
                      <dt className="text-sm text-muted-foreground">
                        Departure Date
                      </dt>
                      <dd className="text-sm mt-1 font-medium">
                        {signal.metadata.departureDate as string}
                      </dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}

          {/* Related Markets */}
          {signal.markets && signal.markets.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Related Markets</CardTitle>
                <CardDescription>
                  Markets potentially relevant to this signal
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {signal.markets.map((market) => (
                  <div
                    key={market.ticker}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">{market.ticker}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {market.title}
                      </p>
                    </div>
                    <div className="text-right mr-4">
                      <p className="text-lg font-bold">
                        {(market.probability * 100).toFixed(0)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Vol: ${(market.volume24h / 1000).toFixed(1)}K
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/trade/${market.ticker}`)}
                    >
                      Trade
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {signal.relatedMarkets.length > 0 && (
                <Button
                  className="w-full"
                  onClick={() =>
                    router.push(`/trade/${signal.relatedMarkets[0]}`)
                  }
                >
                  View Primary Market
                </Button>
              )}
              <Button variant="outline" className="w-full">
                Mark as Acted
              </Button>
              <Button variant="ghost" className="w-full text-muted-foreground">
                Dismiss Signal
              </Button>
            </CardContent>
          </Card>

          {/* Relevance */}
          {signal.userSignal && (
            <Card>
              <CardHeader>
                <CardTitle>Relevance Score</CardTitle>
                <CardDescription>How relevant this is to you</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <p className="text-4xl font-bold text-primary">
                    {signal.userSignal.relevanceScore}
                  </p>
                  <p className="text-sm text-muted-foreground">out of 100</p>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Seen</span>
                    <span>{signal.userSignal.seen ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Acted On</span>
                    <span>{signal.userSignal.actedOn ? "Yes" : "No"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Source info */}
          <Card>
            <CardHeader>
              <CardTitle>Source</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground break-all">
                {signal.source}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Signal ID: {signal.signalId}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
