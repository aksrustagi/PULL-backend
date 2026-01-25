"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pull/ui";
import { Badge } from "@pull/ui";
import { Button } from "@pull/ui";
import { Input } from "@pull/ui";

// ============================================================================
// Types
// ============================================================================

interface Experiment {
  id: string;
  name: string;
  description: string;
  status: "draft" | "running" | "paused" | "completed";
  type: "ab_test" | "feature_flag" | "multivariate";
  variants: Variant[];
  startDate?: string;
  endDate?: string;
  sampleSize: number;
  statisticalSignificance: number;
  winner?: string;
}

interface Variant {
  id: string;
  name: string;
  isControl: boolean;
  weight: number;
  exposures: number;
  conversions: number;
  conversionRate: number;
  lift?: number;
}

// ============================================================================
// Placeholder Data
// ============================================================================

const experiments: Experiment[] = [
  {
    id: "exp-001",
    name: "Onboarding Flow Optimization",
    description: "Test different onboarding experiences to improve completion rate",
    status: "running",
    type: "ab_test",
    variants: [
      { id: "control", name: "Control", isControl: true, weight: 34, exposures: 3400, conversions: 1020, conversionRate: 0.30 },
      { id: "variant_a", name: "Skip KYC for $100", isControl: false, weight: 33, exposures: 3300, conversions: 1155, conversionRate: 0.35, lift: 0.167 },
      { id: "variant_b", name: "Gamified Progress", isControl: false, weight: 33, exposures: 3300, conversions: 1089, conversionRate: 0.33, lift: 0.10 },
    ],
    startDate: "2024-01-15",
    sampleSize: 10000,
    statisticalSignificance: 0.92,
  },
  {
    id: "exp-002",
    name: "Trading UI Simplification",
    description: "Test simplified one-click trading UI",
    status: "running",
    type: "ab_test",
    variants: [
      { id: "control", name: "Standard Form", isControl: true, weight: 34, exposures: 2500, conversions: 750, conversionRate: 0.30 },
      { id: "variant_a", name: "One-Click", isControl: false, weight: 33, exposures: 2450, conversions: 857, conversionRate: 0.35, lift: 0.167 },
      { id: "variant_b", name: "Advanced Mode", isControl: false, weight: 33, exposures: 2450, conversions: 686, conversionRate: 0.28, lift: -0.067 },
    ],
    startDate: "2024-01-18",
    sampleSize: 7400,
    statisticalSignificance: 0.88,
  },
  {
    id: "exp-003",
    name: "Copy Trading CTA",
    description: "Test different copy trading call-to-actions",
    status: "completed",
    type: "ab_test",
    variants: [
      { id: "control", name: "Follow Button", isControl: true, weight: 34, exposures: 5000, conversions: 250, conversionRate: 0.05 },
      { id: "variant_a", name: "Copy Trades Button", isControl: false, weight: 33, exposures: 4900, conversions: 392, conversionRate: 0.08, lift: 0.60 },
      { id: "variant_b", name: "Personalized CTA", isControl: false, weight: 33, exposures: 4900, conversions: 441, conversionRate: 0.09, lift: 0.80 },
    ],
    startDate: "2024-01-01",
    endDate: "2024-01-14",
    sampleSize: 14800,
    statisticalSignificance: 0.98,
    winner: "variant_b",
  },
  {
    id: "exp-004",
    name: "Points Earning Rate",
    description: "Test different points earning strategies for new users",
    status: "paused",
    type: "ab_test",
    variants: [
      { id: "control", name: "Current Rates", isControl: true, weight: 34, exposures: 1200, conversions: 360, conversionRate: 0.30 },
      { id: "variant_a", name: "2x First Week", isControl: false, weight: 33, exposures: 1170, conversions: 409, conversionRate: 0.35, lift: 0.167 },
      { id: "variant_b", name: "Streak Emphasis", isControl: false, weight: 33, exposures: 1170, conversions: 386, conversionRate: 0.33, lift: 0.10 },
    ],
    startDate: "2024-01-10",
    sampleSize: 3540,
    statisticalSignificance: 0.72,
  },
];

const experimentTemplates = [
  { id: "onboarding", name: "Onboarding Flow", description: "Test different onboarding experiences" },
  { id: "trading-ui", name: "Trading UI", description: "Test trading interface variations" },
  { id: "copy-trading", name: "Copy Trading CTA", description: "Test copy trading CTAs" },
  { id: "points-earning", name: "Points Earning", description: "Test points earning strategies" },
];

// ============================================================================
// Components
// ============================================================================

function StatusBadge({ status }: { status: Experiment["status"] }) {
  const variants: Record<Experiment["status"], { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    draft: { variant: "secondary", label: "Draft" },
    running: { variant: "default", label: "Running" },
    paused: { variant: "outline", label: "Paused" },
    completed: { variant: "secondary", label: "Completed" },
  };

  const { variant, label } = variants[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function VariantResultsTable({ variants, winner }: { variants: Variant[]; winner?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-4">Variant</th>
            <th className="text-right py-2 px-4">Exposures</th>
            <th className="text-right py-2 px-4">Conversions</th>
            <th className="text-right py-2 px-4">Rate</th>
            <th className="text-right py-2 pl-4">Lift</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => (
            <tr
              key={variant.id}
              className={`border-b ${winner === variant.id ? "bg-green-500/10" : ""}`}
            >
              <td className="py-2 pr-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{variant.name}</span>
                  {variant.isControl && (
                    <Badge variant="outline" className="text-xs">Control</Badge>
                  )}
                  {winner === variant.id && (
                    <Badge className="text-xs">Winner</Badge>
                  )}
                </div>
              </td>
              <td className="text-right py-2 px-4 text-muted-foreground">
                {variant.exposures.toLocaleString()}
              </td>
              <td className="text-right py-2 px-4 text-muted-foreground">
                {variant.conversions.toLocaleString()}
              </td>
              <td className="text-right py-2 px-4 font-medium">
                {(variant.conversionRate * 100).toFixed(1)}%
              </td>
              <td className="text-right py-2 pl-4">
                {variant.lift !== undefined ? (
                  <span className={variant.lift > 0 ? "text-green-500" : variant.lift < 0 ? "text-red-500" : ""}>
                    {variant.lift > 0 ? "+" : ""}{(variant.lift * 100).toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SignificanceIndicator({ value }: { value: number }) {
  const percentage = value * 100;
  let color = "bg-red-500";
  let label = "Not Significant";

  if (percentage >= 95) {
    color = "bg-green-500";
    label = "Significant";
  } else if (percentage >= 90) {
    color = "bg-yellow-500";
    label = "Approaching";
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Statistical Significance</span>
        <span className="font-medium">{percentage.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{label} (95% threshold)</p>
    </div>
  );
}

function ExperimentCard({ experiment, onViewDetails }: { experiment: Experiment; onViewDetails: () => void }) {
  const daysRunning = experiment.startDate
    ? Math.ceil((Date.now() - new Date(experiment.startDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{experiment.name}</CardTitle>
            <CardDescription className="mt-1">{experiment.description}</CardDescription>
          </div>
          <StatusBadge status={experiment.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{experiment.variants.length}</p>
            <p className="text-xs text-muted-foreground">Variants</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{experiment.sampleSize.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Sample Size</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{daysRunning}</p>
            <p className="text-xs text-muted-foreground">Days Running</p>
          </div>
        </div>

        {/* Significance */}
        <SignificanceIndicator value={experiment.statisticalSignificance} />

        {/* Variant Results */}
        <VariantResultsTable variants={experiment.variants} winner={experiment.winner} />

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onViewDetails}>
            View Details
          </Button>
          {experiment.status === "running" && (
            <Button variant="outline" size="sm">Pause</Button>
          )}
          {experiment.status === "paused" && (
            <Button variant="outline" size="sm">Resume</Button>
          )}
          {experiment.status === "running" && experiment.statisticalSignificance >= 0.95 && (
            <Button size="sm">Complete & Pick Winner</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function ExperimentsDashboardPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filteredExperiments = experiments.filter((exp) => {
    const matchesStatus = statusFilter === "all" || exp.status === statusFilter;
    const matchesSearch = exp.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const statusCounts = {
    all: experiments.length,
    running: experiments.filter((e) => e.status === "running").length,
    paused: experiments.filter((e) => e.status === "paused").length,
    completed: experiments.filter((e) => e.status === "completed").length,
    draft: experiments.filter((e) => e.status === "draft").length,
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">A/B Experiments</h1>
          <p className="text-muted-foreground">Create and manage experiments</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Experiment
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search experiments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          {Object.entries(statusCounts).map(([status, count]) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)} ({count})
            </Button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Experiments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{statusCounts.running}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Sample Size</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {experiments
                .filter((e) => e.status === "running")
                .reduce((sum, e) => sum + e.sampleSize, 0)
                .toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg. Significance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {(
                (experiments
                  .filter((e) => e.status === "running")
                  .reduce((sum, e) => sum + e.statisticalSignificance, 0) /
                  statusCounts.running || 0) * 100
              ).toFixed(0)}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Winners Found</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {experiments.filter((e) => e.winner).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Experiment List */}
      <div className="grid gap-4 lg:grid-cols-2">
        {filteredExperiments.length === 0 ? (
          <Card className="lg:col-span-2">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No experiments found</p>
              <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
                Create your first experiment
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredExperiments.map((experiment) => (
            <ExperimentCard
              key={experiment.id}
              experiment={experiment}
              onViewDetails={() => {
                // Navigate to experiment details
                console.log("View details:", experiment.id);
              }}
            />
          ))
        )}
      </div>

      {/* Templates Section */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Start Templates</CardTitle>
          <CardDescription>Create experiments from proven templates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {experimentTemplates.map((template) => (
              <div
                key={template.id}
                className="p-4 rounded-lg border hover:border-primary cursor-pointer transition-colors"
                onClick={() => {
                  // Create from template
                  console.log("Create from template:", template.id);
                }}
              >
                <h3 className="font-medium">{template.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
