"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface CardDisplayProps {
  name: string;
  imageUrl?: string;
  grade: number;
  gradingCompany: "PSA" | "BGS" | "CGC";
  certNumber: string;
  setName?: string;
  year?: number;
  showZoom?: boolean;
  className?: string;
}

export function CardDisplay({
  name,
  imageUrl,
  grade,
  gradingCompany,
  certNumber,
  setName,
  year,
  showZoom = true,
  className,
}: CardDisplayProps) {
  const [isZoomed, setIsZoomed] = React.useState(false);

  const gradingColors = {
    PSA: "border-red-500 text-red-500 bg-red-500/10",
    BGS: "border-blue-500 text-blue-500 bg-blue-500/10",
    CGC: "border-green-500 text-green-500 bg-green-500/10",
  };

  return (
    <div
      className={cn("relative group", className)}
      onMouseEnter={() => showZoom && setIsZoomed(true)}
      onMouseLeave={() => setIsZoomed(false)}
    >
      {/* Card image */}
      <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-gradient-to-br from-yellow-500/20 to-orange-500/20">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className={cn(
              "w-full h-full object-cover transition-transform duration-300",
              isZoomed && "scale-110"
            )}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-6xl">🃏</span>
          </div>
        )}

        {/* Grading badge */}
        <div
          className={cn(
            "absolute top-2 right-2 px-2 py-1 rounded-md border-2 font-bold text-sm",
            gradingColors[gradingCompany]
          )}
        >
          {gradingCompany} {grade}
        </div>

        {/* Hover overlay */}
        {showZoom && (
          <div
            className={cn(
              "absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity",
              isZoomed && "opacity-100"
            )}
          >
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Card info */}
      <div className="mt-3">
        <h4 className="font-medium text-sm">{name}</h4>
        {(setName || year) && (
          <p className="text-xs text-muted-foreground">
            {setName}
            {setName && year && " "}
            {year && `(${year})`}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Cert #{certNumber}
        </p>
      </div>
    </div>
  );
}
