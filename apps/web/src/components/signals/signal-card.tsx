"use client";

import { useState } from "react";
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

export interface SignalData {
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
  expiresAt?: number;
  createdAt: number;
  userSignal?: {
    relevanceScore: number;
    seen: boolean;
    dismissed: boolean;
    actedOn: boolean;
  };
}

interface SignalCardProps {
  signal: SignalData;
  onDismiss?: (signalId: string) => void;
  onMarkActed?: (signalId: string) => void;
  onViewMarket?: (ticker: string) => void;
  compact?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function getTypeIcon(type: SignalData["type"]): string {
  switch (type) {
    case "email":
      return "M";
    case "social":
      return "S";
    case "market":
      return "M";
    case "news":
      return "N";
    case "correlation":
      return "C";
    default:
      return "?";
  }
}

function getTypeLabel(type: SignalData["type"]): string {
  switch (type) {
    case "email":
      return "Email";
    case "social":
      return "Social";
    case "market":
      return "Market";
    case "news":
      return "News";
    case "correlation":
      return "Correlation";
    default:
      return "Unknown";
  }
}

function getSentimentColor(sentiment: SignalData["sentiment"]): string {
  switch (sentiment) {
    case "bullish":
      return "text-green-500";
    case "bearish":
      return "text-red-500";
    default:
      return "text-gray-500";
  }
}

function getUrgencyBadgeVariant(
  urgency: SignalData["urgency"]
): "default" | "secondary" | "destructive" | "outline" {
  switch (urgency) {
    case "high":
      return "destructive";
    case "medium":
      return "default";
    default:
      return "secondary";
  }
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 80) return "bg-green-500";
  if (confidence >= 60) return "bg-yellow-500";
  return "bg-gray-400";
}

// ============================================================================
// COMPONENT
// ============================================================================

export function SignalCard({
  signal,
  onDismiss,
  onMarkActed,
  onViewMarket,
  compact = false,
}: SignalCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const timeAgo = formatDistanceToNow(new Date(signal.createdAt), {
    addSuffix: true,
  });

  const expiresIn = signal.expiresAt
    ? formatDistanceToNow(new Date(signal.expiresAt), { addSuffix: false })
    : null;

  const isExpired = signal.expiresAt ? Date.now() > signal.expiresAt : false;
  const isUnseen = signal.userSignal && !signal.userSignal.seen;

  if (compact) {
    return (
      <div
        className={`flex items-center justify-between p-3 rounded-lg border ${
          isUnseen ? "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800" : "bg-card"
        } ${isExpired ? "opacity-50" : ""}`}
      >
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${
              signal.urgency === "high"
                ? "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {getTypeIcon(signal.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{signal.title}</p>
            <p className="text-xs text-muted-foreground">{timeAgo}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant={getUrgencyBadgeVariant(signal.urgency)} className="text-xs">
            {signal.urgency}
          </Badge>
          {signal.relatedMarkets.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewMarket?.(signal.relatedMarkets[0])}
            >
              View
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card
      className={`${
        isUnseen ? "border-blue-400 dark:border-blue-600" : ""
      } ${isExpired ? "opacity-60" : ""}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2">
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold ${
                signal.urgency === "high"
                  ? "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400"
                  : signal.urgency === "medium"
                    ? "bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-400"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {getTypeIcon(signal.type)}
            </div>
            <div>
              <CardTitle className="text-base">{signal.title}</CardTitle>
              <CardDescription className="text-xs">
                {getTypeLabel(signal.type)} signal - {timeAgo}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <Badge variant={getUrgencyBadgeVariant(signal.urgency)}>
              {signal.urgency}
            </Badge>
            <Badge
              variant="outline"
              className={getSentimentColor(signal.sentiment)}
            >
              {signal.sentiment}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Description */}
        <p className="text-sm text-muted-foreground">
          {isExpanded || signal.description.length <= 150
            ? signal.description
            : `${signal.description.slice(0, 150)}...`}
          {signal.description.length > 150 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-primary hover:underline ml-1 text-xs"
            >
              {isExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </p>

        {/* Confidence indicator */}
        <div className="flex items-center space-x-2">
          <span className="text-xs text-muted-foreground">Confidence:</span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${getConfidenceColor(signal.confidence)}`}
              style={{ width: `${signal.confidence}%` }}
            />
          </div>
          <span className="text-xs font-medium">{signal.confidence}%</span>
        </div>

        {/* Related markets */}
        {signal.relatedMarkets.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground">Markets:</span>
            {signal.relatedMarkets.slice(0, 5).map((ticker) => (
              <Badge
                key={ticker}
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80"
                onClick={() => onViewMarket?.(ticker)}
              >
                {ticker}
              </Badge>
            ))}
            {signal.relatedMarkets.length > 5 && (
              <Badge variant="outline">
                +{signal.relatedMarkets.length - 5} more
              </Badge>
            )}
          </div>
        )}

        {/* Expiry */}
        {expiresIn && !isExpired && (
          <p className="text-xs text-muted-foreground">
            Expires in {expiresIn}
          </p>
        )}
        {isExpired && (
          <p className="text-xs text-red-500">This signal has expired</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex space-x-2">
            {signal.relatedMarkets.length > 0 && (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  onMarkActed?.(signal._id);
                  onViewMarket?.(signal.relatedMarkets[0]);
                }}
              >
                View Market
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/ai-signals/${signal._id}`}>Details</Link>
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDismiss?.(signal._id)}
            className="text-muted-foreground"
          >
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default SignalCard;
