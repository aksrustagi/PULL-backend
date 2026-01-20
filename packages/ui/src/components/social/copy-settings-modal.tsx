"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export interface CopySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  trader: {
    userId: string;
    displayName: string;
    avatarUrl?: string | null;
    return30d: number;
    sharpeRatio: number;
    copierCount: number;
  };
  userBalance: number;
  userPortfolioValue: number;
  // Existing settings (if editing)
  existingSettings?: {
    allocationPercent: number;
    maxPositionSize: number;
    minPositionSize: number;
    excludeMarketTypes: string[];
  };
  // Actions
  onSave: (settings: {
    allocationPercent: number;
    maxPositionSize: number;
    minPositionSize: number;
    excludeMarketTypes: string[];
  }) => void;
  onDeactivate?: () => void;
  className?: string;
}

const MARKET_TYPES = [
  { value: "politics", label: "Politics" },
  { value: "sports", label: "Sports" },
  { value: "crypto", label: "Crypto" },
  { value: "economics", label: "Economics" },
  { value: "weather", label: "Weather" },
  { value: "entertainment", label: "Entertainment" },
];

export function CopySettingsModal({
  isOpen,
  onClose,
  trader,
  userBalance,
  userPortfolioValue,
  existingSettings,
  onSave,
  onDeactivate,
  className,
}: CopySettingsModalProps) {
  const [step, setStep] = React.useState<"settings" | "confirm">("settings");
  const [allocationPercent, setAllocationPercent] = React.useState(
    existingSettings?.allocationPercent ?? 10
  );
  const [maxPositionSize, setMaxPositionSize] = React.useState(
    existingSettings?.maxPositionSize ?? 100
  );
  const [minPositionSize, setMinPositionSize] = React.useState(
    existingSettings?.minPositionSize ?? 5
  );
  const [excludeMarketTypes, setExcludeMarketTypes] = React.useState<string[]>(
    existingSettings?.excludeMarketTypes ?? []
  );

  // Calculated values
  const allocatedAmount = (userPortfolioValue * allocationPercent) / 100;
  const isEditing = !!existingSettings;

  // Validation
  const errors: string[] = [];
  if (allocationPercent <= 0 || allocationPercent > 100) {
    errors.push("Allocation must be between 1% and 100%");
  }
  if (minPositionSize > maxPositionSize) {
    errors.push("Min position size cannot exceed max position size");
  }
  if (allocatedAmount < minPositionSize) {
    errors.push("Allocated amount is less than minimum position size");
  }

  const handleToggleMarketType = (marketType: string) => {
    setExcludeMarketTypes((prev) =>
      prev.includes(marketType)
        ? prev.filter((t) => t !== marketType)
        : [...prev, marketType]
    );
  };

  const handleContinue = () => {
    if (errors.length === 0) {
      setStep("confirm");
    }
  };

  const handleConfirm = () => {
    onSave({
      allocationPercent,
      maxPositionSize,
      minPositionSize,
      excludeMarketTypes,
    });
    onClose();
  };

  const handleBack = () => {
    setStep("settings");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={cn(
          "relative bg-card rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            {trader.avatarUrl ? (
              <img
                src={trader.avatarUrl}
                alt={trader.displayName}
                className="w-10 h-10 rounded-full"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <span className="font-semibold text-muted-foreground">
                  {trader.displayName.charAt(0)}
                </span>
              </div>
            )}
            <div>
              <h2 className="font-semibold">
                {isEditing ? "Edit Copy Settings" : "Copy"} {trader.displayName}
              </h2>
              <p className="text-sm text-muted-foreground">
                {trader.copierCount.toLocaleString()} copiers
              </p>
            </div>
          </div>
          <button
            className="p-2 hover:bg-muted rounded-full"
            onClick={onClose}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {step === "settings" ? (
          <>
            {/* Settings form */}
            <div className="p-6 space-y-6">
              {/* Trader stats summary */}
              <div className="flex justify-between p-4 bg-muted/50 rounded-lg">
                <div className="text-center">
                  <p
                    className={cn(
                      "text-lg font-bold",
                      trader.return30d >= 0 ? "text-green-500" : "text-red-500"
                    )}
                  >
                    {trader.return30d >= 0 ? "+" : ""}
                    {trader.return30d.toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground">30d Return</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold">{trader.sharpeRatio.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Sharpe</p>
                </div>
              </div>

              {/* Allocation slider */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Portfolio Allocation
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={allocationPercent}
                    onChange={(e) => setAllocationPercent(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <div className="w-24 flex items-center">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={allocationPercent}
                      onChange={(e) => setAllocationPercent(parseInt(e.target.value) || 0)}
                      className="w-16 px-2 py-1 text-right border rounded"
                    />
                    <span className="ml-1">%</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  ${allocatedAmount.toFixed(2)} of your ${userPortfolioValue.toFixed(2)} portfolio
                </p>
              </div>

              {/* Position size limits */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Min Position Size
                  </label>
                  <div className="flex items-center">
                    <span className="mr-2">$</span>
                    <input
                      type="number"
                      min={1}
                      value={minPositionSize}
                      onChange={(e) => setMinPositionSize(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Max Position Size
                  </label>
                  <div className="flex items-center">
                    <span className="mr-2">$</span>
                    <input
                      type="number"
                      min={1}
                      value={maxPositionSize}
                      onChange={(e) => setMaxPositionSize(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                </div>
              </div>

              {/* Market type exclusions */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Exclude Market Types
                </label>
                <p className="text-sm text-muted-foreground mb-3">
                  Trades in these categories will not be copied
                </p>
                <div className="flex flex-wrap gap-2">
                  {MARKET_TYPES.map((type) => (
                    <button
                      key={type.value}
                      className={cn(
                        "px-3 py-1.5 text-sm rounded-full border transition-colors",
                        excludeMarketTypes.includes(type.value)
                          ? "bg-red-500/10 border-red-500 text-red-500"
                          : "hover:bg-muted"
                      )}
                      onClick={() => handleToggleMarketType(type.value)}
                    >
                      {excludeMarketTypes.includes(type.value) && (
                        <span className="mr-1">✕</span>
                      )}
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Validation errors */}
              {errors.length > 0 && (
                <div className="p-3 bg-red-500/10 text-red-500 rounded-lg text-sm">
                  <ul className="list-disc list-inside space-y-1">
                    {errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t flex gap-3">
              {isEditing && onDeactivate && (
                <button
                  className="px-4 py-2 text-sm font-medium rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/20"
                  onClick={onDeactivate}
                >
                  Stop Copying
                </button>
              )}
              <div className="flex-1" />
              <button
                className="px-4 py-2 text-sm font-medium rounded-md bg-muted hover:bg-muted/80"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="px-6 py-2 text-sm font-medium rounded-md bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
                onClick={handleContinue}
                disabled={errors.length > 0}
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Confirmation step */}
            <div className="p-6 space-y-6">
              <div className="text-center py-4">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2">Confirm Copy Settings</h3>
                <p className="text-muted-foreground">
                  You're about to {isEditing ? "update" : "start"} copying {trader.displayName}
                </p>
              </div>

              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Allocation</span>
                  <span className="font-medium">{allocationPercent}% (${allocatedAmount.toFixed(2)})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Position Range</span>
                  <span className="font-medium">${minPositionSize} - ${maxPositionSize}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Excluded Markets</span>
                  <span className="font-medium">
                    {excludeMarketTypes.length === 0 ? "None" : excludeMarketTypes.length}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-yellow-500/10 rounded-lg text-sm">
                <p className="font-medium text-yellow-700 mb-1">Important:</p>
                <ul className="text-yellow-600 space-y-1 list-disc list-inside">
                  <li>Trades will be copied automatically when {trader.displayName} trades</li>
                  <li>Position sizes will be scaled based on your allocation</li>
                  <li>You can stop copying at any time</li>
                  <li>Past performance doesn't guarantee future results</li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t flex gap-3 justify-end">
              <button
                className="px-4 py-2 text-sm font-medium rounded-md bg-muted hover:bg-muted/80"
                onClick={handleBack}
              >
                Back
              </button>
              <button
                className="px-6 py-2 text-sm font-medium rounded-md bg-green-500 text-white hover:bg-green-600"
                onClick={handleConfirm}
              >
                {isEditing ? "Save Changes" : "Start Copying"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
