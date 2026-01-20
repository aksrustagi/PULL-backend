"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface AssetListingCardProps {
  id: string;
  name: string;
  setName: string;
  year: number;
  imageUrl?: string;
  grade: number;
  gradingCompany: "PSA" | "BGS" | "CGC";
  certNumber: string;
  pricePerShare: number;
  totalShares: number;
  availableShares: number;
  priceHistory?: number[];
  onBuy?: () => void;
  onClick?: () => void;
  className?: string;
}

export function AssetListingCard({
  id,
  name,
  setName,
  year,
  imageUrl,
  grade,
  gradingCompany,
  certNumber,
  pricePerShare,
  totalShares,
  availableShares,
  priceHistory = [],
  onBuy,
  onClick,
  className,
}: AssetListingCardProps) {
  const gradingColors = {
    PSA: "border-red-500 text-red-500",
    BGS: "border-blue-500 text-blue-500",
    CGC: "border-green-500 text-green-500",
  };

  const soldPercentage = ((totalShares - availableShares) / totalShares) * 100;

  // Mini price chart
  const renderMiniChart = () => {
    if (priceHistory.length < 2) return null;

    const min = Math.min(...priceHistory);
    const max = Math.max(...priceHistory);
    const range = max - min || 1;

    const points = priceHistory
      .map((price, idx) => {
        const x = (idx / (priceHistory.length - 1)) * 100;
        const y = 100 - ((price - min) / range) * 100;
        return `${x},${y}`;
      })
      .join(" ");

    const isUp = priceHistory[priceHistory.length - 1] >= priceHistory[0];

    return (
      <svg viewBox="0 0 100 40" className="w-full h-8" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke={isUp ? "#22c55e" : "#ef4444"}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-card overflow-hidden hover:bg-muted/50 transition-colors cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {/* Card image */}
      <div className="relative aspect-[3/4] bg-gradient-to-br from-yellow-500/20 to-orange-500/20">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-6xl">🃏</span>
          </div>
        )}

        {/* Grading badge */}
        <div
          className={cn(
            "absolute top-2 right-2 px-2 py-1 rounded-md border-2 font-bold text-xs bg-background/90",
            gradingColors[gradingCompany]
          )}
        >
          {gradingCompany} {grade}
        </div>

        {/* Shares sold indicator */}
        {soldPercentage > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-muted">
            <div
              className="h-full bg-primary"
              style={{ width: `${soldPercentage}%` }}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-1">
          <h4 className="font-medium text-sm line-clamp-1">{name}</h4>
          <span className="text-xs text-muted-foreground ml-2">
            #{certNumber.slice(-6)}
          </span>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          {setName} ({year})
        </p>

        {/* Price chart */}
        {priceHistory.length > 0 && (
          <div className="mb-3">{renderMiniChart()}</div>
        )}

        {/* Price and shares */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-lg font-bold">
              ${pricePerShare.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">per share</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">
              {availableShares}/{totalShares}
            </p>
            <p className="text-xs text-muted-foreground">available</p>
          </div>
        </div>

        {/* Buy button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBuy?.();
          }}
          className="w-full mt-4 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Buy Shares
        </button>
      </div>
    </div>
  );
}
