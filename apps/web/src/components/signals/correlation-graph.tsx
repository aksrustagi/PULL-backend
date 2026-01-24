"use client";

import { useState, useMemo } from "react";
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

export interface CorrelationData {
  market: string;
  correlation: number;
  sampleSize: number;
  pValue: number;
  updatedAt: number;
}

export interface MarketNode {
  id: string;
  label: string;
  correlations: CorrelationData[];
}

interface CorrelationGraphProps {
  centerMarket: string;
  correlations: CorrelationData[];
  onSelectMarket?: (ticker: string) => void;
  isLoading?: boolean;
  showDetails?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

function getCorrelationColor(correlation: number): string {
  const absCorr = Math.abs(correlation);
  if (correlation > 0) {
    if (absCorr >= 0.8) return "bg-green-500";
    if (absCorr >= 0.6) return "bg-green-400";
    return "bg-green-300";
  } else {
    if (absCorr >= 0.8) return "bg-red-500";
    if (absCorr >= 0.6) return "bg-red-400";
    return "bg-red-300";
  }
}

function getCorrelationTextColor(correlation: number): string {
  return correlation > 0 ? "text-green-600" : "text-red-600";
}

function formatCorrelation(correlation: number): string {
  const sign = correlation >= 0 ? "+" : "";
  return `${sign}${(correlation * 100).toFixed(0)}%`;
}

// ============================================================================
// CORRELATION NODE COMPONENT
// ============================================================================

interface CorrelationNodeProps {
  market: string;
  correlation: number;
  sampleSize: number;
  onClick?: () => void;
  isCenter?: boolean;
  position?: { x: number; y: number };
}

function CorrelationNode({
  market,
  correlation,
  sampleSize,
  onClick,
  isCenter = false,
}: CorrelationNodeProps) {
  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center justify-center p-3 rounded-lg border transition-all
        hover:scale-105 hover:shadow-md
        ${isCenter ? "bg-primary text-primary-foreground w-24 h-24" : "bg-card w-20 h-20"}
      `}
    >
      <span
        className={`text-xs font-bold truncate max-w-full ${
          isCenter ? "" : "text-foreground"
        }`}
      >
        {market}
      </span>
      {!isCenter && (
        <>
          <span
            className={`text-sm font-bold ${getCorrelationTextColor(correlation)}`}
          >
            {formatCorrelation(correlation)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            n={sampleSize}
          </span>
        </>
      )}
    </button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CorrelationGraph({
  centerMarket,
  correlations,
  onSelectMarket,
  isLoading = false,
  showDetails = true,
}: CorrelationGraphProps) {
  const [selectedCorrelation, setSelectedCorrelation] = useState<CorrelationData | null>(
    null
  );
  const [filterStrength, setFilterStrength] = useState<"all" | "strong" | "very_strong">(
    "all"
  );

  // Filter correlations based on strength
  const filteredCorrelations = useMemo(() => {
    return correlations.filter((c) => {
      const absCorr = Math.abs(c.correlation);
      switch (filterStrength) {
        case "very_strong":
          return absCorr >= 0.8;
        case "strong":
          return absCorr >= 0.6;
        default:
          return true;
      }
    });
  }, [correlations, filterStrength]);

  // Sort by absolute correlation
  const sortedCorrelations = useMemo(() => {
    return [...filteredCorrelations].sort(
      (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)
    );
  }, [filteredCorrelations]);

  // Separate positive and negative correlations
  const positiveCorrelations = sortedCorrelations.filter((c) => c.correlation > 0);
  const negativeCorrelations = sortedCorrelations.filter((c) => c.correlation < 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Correlation Network
              <Badge variant="secondary">{centerMarket}</Badge>
            </CardTitle>
            <CardDescription>
              Markets statistically correlated with {centerMarket}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterStrength}
              onChange={(e) => setFilterStrength(e.target.value as typeof filterStrength)}
              className="text-sm border rounded px-2 py-1 bg-background"
            >
              <option value="all">All correlations</option>
              <option value="strong">Strong (60%+)</option>
              <option value="very_strong">Very strong (80%+)</option>
            </select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && correlations.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">~</div>
            <p className="text-muted-foreground">
              No significant correlations found
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Correlations require at least 30 data points
            </p>
          </div>
        )}

        {/* Correlation visualization */}
        {!isLoading && sortedCorrelations.length > 0 && (
          <>
            {/* Visual network representation */}
            <div className="relative flex flex-col items-center space-y-8">
              {/* Positive correlations */}
              {positiveCorrelations.length > 0 && (
                <div className="w-full">
                  <p className="text-xs text-green-600 font-medium mb-2 text-center">
                    Positive Correlations
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {positiveCorrelations.slice(0, 8).map((corr) => (
                      <CorrelationNode
                        key={corr.market}
                        market={corr.market}
                        correlation={corr.correlation}
                        sampleSize={corr.sampleSize}
                        onClick={() => {
                          setSelectedCorrelation(corr);
                          onSelectMarket?.(corr.market);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Center market */}
              <div className="flex items-center justify-center">
                <CorrelationNode
                  market={centerMarket}
                  correlation={1}
                  sampleSize={0}
                  isCenter
                  onClick={() => onSelectMarket?.(centerMarket)}
                />
              </div>

              {/* Negative correlations */}
              {negativeCorrelations.length > 0 && (
                <div className="w-full">
                  <p className="text-xs text-red-600 font-medium mb-2 text-center">
                    Negative Correlations
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {negativeCorrelations.slice(0, 8).map((corr) => (
                      <CorrelationNode
                        key={corr.market}
                        market={corr.market}
                        correlation={corr.correlation}
                        sampleSize={corr.sampleSize}
                        onClick={() => {
                          setSelectedCorrelation(corr);
                          onSelectMarket?.(corr.market);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Selected correlation details */}
            {showDetails && selectedCorrelation && (
              <div className="border rounded-lg p-4 bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">
                    {centerMarket} ↔ {selectedCorrelation.market}
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCorrelation(null)}
                  >
                    x
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Correlation</p>
                    <p
                      className={`text-lg font-bold ${getCorrelationTextColor(
                        selectedCorrelation.correlation
                      )}`}
                    >
                      {formatCorrelation(selectedCorrelation.correlation)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sample Size</p>
                    <p className="text-lg font-bold">
                      {selectedCorrelation.sampleSize}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">p-value</p>
                    <p className="text-lg font-bold">
                      {selectedCorrelation.pValue.toFixed(4)}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  {selectedCorrelation.correlation > 0
                    ? "These markets tend to move in the same direction."
                    : "These markets tend to move in opposite directions."}
                  {Math.abs(selectedCorrelation.correlation) >= 0.8 &&
                    " This is a very strong correlation."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => onSelectMarket?.(selectedCorrelation.market)}
                >
                  View {selectedCorrelation.market}
                </Button>
              </div>
            )}

            {/* Correlation list */}
            {showDetails && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted px-4 py-2 border-b">
                  <h4 className="text-sm font-medium">All Correlations</h4>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2">Market</th>
                        <th className="text-right px-4 py-2">Correlation</th>
                        <th className="text-right px-4 py-2">Samples</th>
                        <th className="text-right px-4 py-2">Significance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCorrelations.map((corr) => (
                        <tr
                          key={corr.market}
                          className="border-b hover:bg-muted/30 cursor-pointer"
                          onClick={() => {
                            setSelectedCorrelation(corr);
                            onSelectMarket?.(corr.market);
                          }}
                        >
                          <td className="px-4 py-2 font-medium">{corr.market}</td>
                          <td
                            className={`px-4 py-2 text-right font-bold ${getCorrelationTextColor(
                              corr.correlation
                            )}`}
                          >
                            {formatCorrelation(corr.correlation)}
                          </td>
                          <td className="px-4 py-2 text-right text-muted-foreground">
                            {corr.sampleSize}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <Badge
                              variant={corr.pValue < 0.05 ? "default" : "secondary"}
                            >
                              {corr.pValue < 0.05 ? "Significant" : "Weak"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-green-500" />
                <span>Positive correlation</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-red-500" />
                <span>Negative correlation</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default CorrelationGraph;
