import * as React from "react";
import { cn } from "../../lib/utils";
import { Button } from "../button";
import { Input } from "../input";
import { Badge } from "../badge";

export interface CopySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  traderName: string;
  onSubmit: (settings: CopySettings) => void;
  className?: string;
}

export interface CopySettings {
  copyMode: "fixed_amount" | "percentage_portfolio" | "proportional" | "fixed_ratio";
  fixedAmount?: number;
  portfolioPercentage?: number;
  copyRatio?: number;
  maxPositionSize: number;
  maxDailyLoss: number;
  maxTotalExposure: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  copyAssetClasses: string[];
  excludedSymbols: string[];
  copyDelaySeconds: number;
}

export function CopySettingsModal({
  isOpen,
  onClose,
  traderName,
  onSubmit,
  className,
}: CopySettingsModalProps) {
  const [copyMode, setCopyMode] = React.useState<CopySettings["copyMode"]>("fixed_amount");
  const [fixedAmount, setFixedAmount] = React.useState("1000");
  const [portfolioPercentage, setPortfolioPercentage] = React.useState("10");
  const [copyRatio, setCopyRatio] = React.useState("1");
  const [maxPositionSize, setMaxPositionSize] = React.useState("5000");
  const [maxDailyLoss, setMaxDailyLoss] = React.useState("1000");
  const [maxTotalExposure, setMaxTotalExposure] = React.useState("10000");
  const [stopLossPercent, setStopLossPercent] = React.useState("");
  const [takeProfitPercent, setTakeProfitPercent] = React.useState("");
  const [copyDelaySeconds, setCopyDelaySeconds] = React.useState("0");
  const [selectedAssetClasses, setSelectedAssetClasses] = React.useState<string[]>(["crypto"]);
  const [excludedSymbols, setExcludedSymbols] = React.useState<string[]>([]);
  const [symbolInput, setSymbolInput] = React.useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const settings: CopySettings = {
      copyMode,
      maxPositionSize: parseFloat(maxPositionSize),
      maxDailyLoss: parseFloat(maxDailyLoss),
      maxTotalExposure: parseFloat(maxTotalExposure),
      copyAssetClasses: selectedAssetClasses,
      excludedSymbols,
      copyDelaySeconds: parseFloat(copyDelaySeconds),
    };

    if (copyMode === "fixed_amount") {
      settings.fixedAmount = parseFloat(fixedAmount);
    } else if (copyMode === "percentage_portfolio") {
      settings.portfolioPercentage = parseFloat(portfolioPercentage);
    } else if (copyMode === "fixed_ratio" || copyMode === "proportional") {
      settings.copyRatio = parseFloat(copyRatio);
    }

    if (stopLossPercent) {
      settings.stopLossPercent = parseFloat(stopLossPercent);
    }
    if (takeProfitPercent) {
      settings.takeProfitPercent = parseFloat(takeProfitPercent);
    }

    onSubmit(settings);
  };

  const toggleAssetClass = (assetClass: string) => {
    setSelectedAssetClasses((prev) =>
      prev.includes(assetClass)
        ? prev.filter((c) => c !== assetClass)
        : [...prev, assetClass]
    );
  };

  const addExcludedSymbol = () => {
    if (symbolInput && !excludedSymbols.includes(symbolInput)) {
      setExcludedSymbols([...excludedSymbols, symbolInput]);
      setSymbolInput("");
    }
  };

  const removeExcludedSymbol = (symbol: string) => {
    setExcludedSymbols(excludedSymbols.filter((s) => s !== symbol));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={cn(
          "bg-background rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto",
          className
        )}
      >
        <div className="sticky top-0 bg-background border-b p-6 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Copy Trading Settings</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Configure how you want to copy trades from {traderName}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Copy Mode */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Copy Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "fixed_amount", label: "Fixed Amount" },
                { value: "percentage_portfolio", label: "Portfolio %" },
                { value: "proportional", label: "Proportional" },
                { value: "fixed_ratio", label: "Fixed Ratio" },
              ].map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={cn(
                    "p-3 rounded-lg border text-sm font-medium transition-colors",
                    copyMode === mode.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                  onClick={() => setCopyMode(mode.value as CopySettings["copyMode"])}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mode-specific inputs */}
          {copyMode === "fixed_amount" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Fixed Amount ($)</label>
              <Input
                type="number"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(e.target.value)}
                placeholder="1000"
                min="0"
                step="0.01"
              />
              <p className="text-xs text-muted-foreground">
                Copy trades with this fixed dollar amount
              </p>
            </div>
          )}

          {copyMode === "percentage_portfolio" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Portfolio Percentage (%)</label>
              <Input
                type="number"
                value={portfolioPercentage}
                onChange={(e) => setPortfolioPercentage(e.target.value)}
                placeholder="10"
                min="0"
                max="100"
                step="0.1"
              />
              <p className="text-xs text-muted-foreground">
                Use this percentage of your portfolio for each trade
              </p>
            </div>
          )}

          {(copyMode === "proportional" || copyMode === "fixed_ratio") && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Copy Ratio</label>
              <Input
                type="number"
                value={copyRatio}
                onChange={(e) => setCopyRatio(e.target.value)}
                placeholder="1"
                min="0"
                step="0.01"
              />
              <p className="text-xs text-muted-foreground">
                Multiply the trader's position size by this ratio
              </p>
            </div>
          )}

          {/* Risk Controls */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-medium">Risk Controls</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Max Position Size ($)</label>
                <Input
                  type="number"
                  value={maxPositionSize}
                  onChange={(e) => setMaxPositionSize(e.target.value)}
                  placeholder="5000"
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Max Daily Loss ($)</label>
                <Input
                  type="number"
                  value={maxDailyLoss}
                  onChange={(e) => setMaxDailyLoss(e.target.value)}
                  placeholder="1000"
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Max Total Exposure ($)</label>
                <Input
                  type="number"
                  value={maxTotalExposure}
                  onChange={(e) => setMaxTotalExposure(e.target.value)}
                  placeholder="10000"
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Copy Delay (seconds)</label>
                <Input
                  type="number"
                  value={copyDelaySeconds}
                  onChange={(e) => setCopyDelaySeconds(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="1"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Stop Loss (%)</label>
                <Input
                  type="number"
                  value={stopLossPercent}
                  onChange={(e) => setStopLossPercent(e.target.value)}
                  placeholder="Optional"
                  min="0"
                  max="100"
                  step="0.1"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Take Profit (%)</label>
                <Input
                  type="number"
                  value={takeProfitPercent}
                  onChange={(e) => setTakeProfitPercent(e.target.value)}
                  placeholder="Optional"
                  min="0"
                  step="0.1"
                />
              </div>
            </div>
          </div>

          {/* Asset Classes */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Asset Classes to Copy</label>
            <div className="flex gap-2">
              {["crypto", "prediction", "rwa"].map((assetClass) => (
                <button
                  key={assetClass}
                  type="button"
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                    selectedAssetClasses.includes(assetClass)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                  onClick={() => toggleAssetClass(assetClass)}
                >
                  {assetClass.charAt(0).toUpperCase() + assetClass.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Excluded Symbols */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Excluded Symbols</label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                placeholder="Enter symbol"
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addExcludedSymbol();
                  }
                }}
              />
              <Button type="button" onClick={addExcludedSymbol}>
                Add
              </Button>
            </div>
            {excludedSymbols.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {excludedSymbols.map((symbol) => (
                  <Badge
                    key={symbol}
                    variant="secondary"
                    className="cursor-pointer hover:bg-destructive/80"
                    onClick={() => removeExcludedSymbol(symbol)}
                  >
                    {symbol}
                    <span className="ml-1">×</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              Start Copy Trading
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
