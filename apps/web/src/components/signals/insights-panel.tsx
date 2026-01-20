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
import { Badge } from "@pull/ui";

// ============================================================================
// TYPES
// ============================================================================

export type InsightType = "portfolio" | "opportunity" | "risk" | "trend" | "social";

export interface InsightData {
  _id: string;
  insightType: InsightType;
  title: string;
  content: string;
  priority: number;
  action?: string;
  relatedMarket?: string;
  dismissed: boolean;
  createdAt: number;
}

export interface DailyBriefingData {
  greeting: string;
  summary: string;
  insights: InsightData[];
  generatedAt: number;
}

interface InsightsPanelProps {
  briefing?: DailyBriefingData | null;
  insights: InsightData[];
  onDismiss?: (insightId: string) => void;
  onViewMarket?: (ticker: string) => void;
  isLoading?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function getInsightIcon(type: InsightType): string {
  switch (type) {
    case "portfolio":
      return "$";
    case "opportunity":
      return "!";
    case "risk":
      return "!";
    case "trend":
      return "#";
    case "social":
      return "@";
    default:
      return "?";
  }
}

function getInsightColor(type: InsightType): string {
  switch (type) {
    case "portfolio":
      return "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400";
    case "opportunity":
      return "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400";
    case "risk":
      return "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400";
    case "trend":
      return "bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400";
    case "social":
      return "bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getPriorityLabel(priority: number): string {
  if (priority >= 5) return "Critical";
  if (priority >= 4) return "High";
  if (priority >= 3) return "Medium";
  return "Low";
}

// ============================================================================
// INSIGHT CARD COMPONENT
// ============================================================================

interface InsightCardProps {
  insight: InsightData;
  onDismiss?: (insightId: string) => void;
  onViewMarket?: (ticker: string) => void;
  defaultExpanded?: boolean;
}

function InsightCard({
  insight,
  onDismiss,
  onViewMarket,
  defaultExpanded = false,
}: InsightCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div
      className={`border rounded-lg p-4 transition-all ${
        insight.dismissed ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${getInsightColor(
              insight.insightType
            )}`}
          >
            {getInsightIcon(insight.insightType)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-sm">{insight.title}</h4>
              <Badge variant="outline" className="text-xs">
                {insight.insightType}
              </Badge>
            </div>
            <p
              className={`text-sm text-muted-foreground ${
                isExpanded ? "" : "line-clamp-2"
              }`}
            >
              {insight.content}
            </p>
            {insight.content.length > 100 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-xs text-primary hover:underline mt-1"
              >
                {isExpanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDismiss?.(insight._id)}
          className="text-muted-foreground h-8 w-8 p-0"
        >
          x
        </Button>
      </div>

      {/* Action and related market */}
      {(insight.action || insight.relatedMarket) && (
        <div className="mt-3 pt-3 border-t flex items-center justify-between">
          {insight.action && (
            <p className="text-xs text-muted-foreground italic">
              Action: {insight.action}
            </p>
          )}
          {insight.relatedMarket && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewMarket?.(insight.relatedMarket!)}
            >
              View {insight.relatedMarket}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function InsightsPanel({
  briefing,
  insights,
  onDismiss,
  onViewMarket,
  isLoading = false,
}: InsightsPanelProps) {
  const [showAll, setShowAll] = useState(false);

  // Filter active insights and sort by priority
  const activeInsights = insights
    .filter((i) => !i.dismissed)
    .sort((a, b) => b.priority - a.priority);

  const displayedInsights = showAll ? activeInsights : activeInsights.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Morning Briefing Section */}
      {briefing && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{briefing.greeting}</CardTitle>
            <CardDescription>{briefing.summary}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Generated at{" "}
              {new Date(briefing.generatedAt).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Insights List */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Your Insights
              {activeInsights.length > 0 && (
                <Badge variant="secondary">{activeInsights.length}</Badge>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/ai-signals">View All</Link>
            </Button>
          </div>
          <CardDescription>
            AI-generated insights based on your portfolio and market activity
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Loading state */}
          {isLoading && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-24 bg-muted rounded-lg" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && activeInsights.length === 0 && (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">?</div>
              <p className="text-muted-foreground">
                No insights available yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Insights are generated based on your activity and market signals
              </p>
            </div>
          )}

          {/* Insights list */}
          {!isLoading && displayedInsights.length > 0 && (
            <>
              <div className="space-y-3">
                {displayedInsights.map((insight, index) => (
                  <InsightCard
                    key={insight._id}
                    insight={insight}
                    onDismiss={onDismiss}
                    onViewMarket={onViewMarket}
                    defaultExpanded={index === 0}
                  />
                ))}
              </div>

              {activeInsights.length > 5 && (
                <div className="text-center pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAll(!showAll)}
                  >
                    {showAll
                      ? "Show less"
                      : `Show ${activeInsights.length - 5} more`}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Insight Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
            {(["portfolio", "opportunity", "risk", "trend", "social"] as InsightType[]).map(
              (type) => {
                const count = activeInsights.filter(
                  (i) => i.insightType === type
                ).length;
                return (
                  <div key={type} className="space-y-1">
                    <div
                      className={`h-10 w-10 rounded-full mx-auto flex items-center justify-center ${getInsightColor(
                        type
                      )}`}
                    >
                      {getInsightIcon(type)}
                    </div>
                    <p className="text-xs font-medium capitalize">{type}</p>
                    <p className="text-lg font-bold">{count}</p>
                  </div>
                );
              }
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default InsightsPanel;
