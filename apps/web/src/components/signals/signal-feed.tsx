"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@pull/ui";
import { Button } from "@pull/ui";
import { Badge } from "@pull/ui";
import { SignalCard, type SignalData } from "./signal-card";

// ============================================================================
// TYPES
// ============================================================================

type SignalType = "email" | "social" | "market" | "news" | "correlation";
type Urgency = "low" | "medium" | "high";

interface SignalFeedProps {
  signals: SignalData[];
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  onDismiss?: (signalId: string) => void;
  onMarkActed?: (signalId: string) => void;
  onViewMarket?: (ticker: string) => void;
  title?: string;
  showFilters?: boolean;
  emptyMessage?: string;
}

interface FilterState {
  types: SignalType[];
  urgency: Urgency | null;
  unseenOnly: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function SignalFeed({
  signals,
  isLoading = false,
  onLoadMore,
  hasMore = false,
  onDismiss,
  onMarkActed,
  onViewMarket,
  title = "Signal Feed",
  showFilters = true,
  emptyMessage = "No signals to display",
}: SignalFeedProps) {
  const [filters, setFilters] = useState<FilterState>({
    types: [],
    urgency: null,
    unseenOnly: false,
  });

  // Filter signals
  const filteredSignals = signals.filter((signal) => {
    // Type filter
    if (filters.types.length > 0 && !filters.types.includes(signal.type)) {
      return false;
    }

    // Urgency filter
    if (filters.urgency && signal.urgency !== filters.urgency) {
      return false;
    }

    // Unseen filter
    if (filters.unseenOnly && signal.userSignal?.seen) {
      return false;
    }

    return true;
  });

  const toggleTypeFilter = useCallback((type: SignalType) => {
    setFilters((prev) => ({
      ...prev,
      types: prev.types.includes(type)
        ? prev.types.filter((t) => t !== type)
        : [...prev.types, type],
    }));
  }, []);

  const toggleUrgencyFilter = useCallback((urgency: Urgency) => {
    setFilters((prev) => ({
      ...prev,
      urgency: prev.urgency === urgency ? null : urgency,
    }));
  }, []);

  const toggleUnseenFilter = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      unseenOnly: !prev.unseenOnly,
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      types: [],
      urgency: null,
      unseenOnly: false,
    });
  }, []);

  const hasActiveFilters =
    filters.types.length > 0 || filters.urgency !== null || filters.unseenOnly;

  const signalTypes: SignalType[] = ["email", "social", "market", "news", "correlation"];
  const urgencyLevels: Urgency[] = ["high", "medium", "low"];

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {title}
            {filteredSignals.length > 0 && (
              <Badge variant="secondary">{filteredSignals.length}</Badge>
            )}
          </CardTitle>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="space-y-3 pt-2">
            {/* Type filters */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Type:</span>
              {signalTypes.map((type) => (
                <Badge
                  key={type}
                  variant={filters.types.includes(type) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleTypeFilter(type)}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Badge>
              ))}
            </div>

            {/* Urgency filters */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Urgency:</span>
              {urgencyLevels.map((urgency) => (
                <Badge
                  key={urgency}
                  variant={
                    filters.urgency === urgency
                      ? urgency === "high"
                        ? "destructive"
                        : "default"
                      : "outline"
                  }
                  className="cursor-pointer"
                  onClick={() => toggleUrgencyFilter(urgency)}
                >
                  {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
                </Badge>
              ))}
            </div>

            {/* Unseen filter */}
            <div className="flex items-center gap-2">
              <Badge
                variant={filters.unseenOnly ? "default" : "outline"}
                className="cursor-pointer"
                onClick={toggleUnseenFilter}
              >
                Unseen only
              </Badge>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Loading state */}
        {isLoading && signals.length === 0 && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-32 bg-muted rounded-lg" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filteredSignals.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">
              {hasActiveFilters ? "!" : "?"}
            </div>
            <p className="text-muted-foreground">
              {hasActiveFilters
                ? "No signals match your filters"
                : emptyMessage}
            </p>
            {hasActiveFilters && (
              <Button variant="link" onClick={clearFilters} className="mt-2">
                Clear filters to see all signals
              </Button>
            )}
          </div>
        )}

        {/* Signal list */}
        {filteredSignals.length > 0 && (
          <div className="space-y-4">
            {filteredSignals.map((signal) => (
              <SignalCard
                key={signal._id}
                signal={signal}
                onDismiss={onDismiss}
                onMarkActed={onMarkActed}
                onViewMarket={onViewMarket}
              />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && !isLoading && (
          <div className="text-center pt-4">
            <Button variant="outline" onClick={onLoadMore}>
              Load more signals
            </Button>
          </div>
        )}

        {/* Loading more indicator */}
        {isLoading && signals.length > 0 && (
          <div className="text-center py-4">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SignalFeed;
