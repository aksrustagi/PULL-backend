"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pull/ui";
import { Badge } from "@pull/ui";
import { Button } from "@pull/ui";

// ============================================================================
// Types
// ============================================================================

interface MetricCard {
  title: string;
  value: string | number;
  change: number;
  changeLabel: string;
  trend: "up" | "down" | "stable";
}

interface FunnelStep {
  name: string;
  count: number;
  conversionRate: number;
  dropoffRate: number;
}

interface RetentionCohort {
  cohortDate: string;
  cohortSize: number;
  d1: number;
  d7: number;
  d30: number;
}

interface Anomaly {
  date: string;
  metric: string;
  severity: "low" | "medium" | "high";
  message: string;
}

// ============================================================================
// Placeholder Data
// ============================================================================

const metricsCards: MetricCard[] = [
  { title: "Daily Active Users", value: "12,458", change: 5.2, changeLabel: "vs yesterday", trend: "up" },
  { title: "New Signups", value: "847", change: -2.1, changeLabel: "vs yesterday", trend: "down" },
  { title: "Trading Volume", value: "$2.4M", change: 12.5, changeLabel: "vs yesterday", trend: "up" },
  { title: "Total Fees", value: "$24,000", change: 8.3, changeLabel: "vs yesterday", trend: "up" },
];

const funnelSteps: FunnelStep[] = [
  { name: "Signup", count: 10000, conversionRate: 1, dropoffRate: 0 },
  { name: "Email Verified", count: 8500, conversionRate: 0.85, dropoffRate: 0.15 },
  { name: "KYC Started", count: 6800, conversionRate: 0.8, dropoffRate: 0.2 },
  { name: "KYC Completed", count: 5440, conversionRate: 0.8, dropoffRate: 0.2 },
  { name: "First Deposit", count: 3264, conversionRate: 0.6, dropoffRate: 0.4 },
  { name: "First Trade", count: 2611, conversionRate: 0.8, dropoffRate: 0.2 },
];

const retentionCohorts: RetentionCohort[] = [
  { cohortDate: "2024-01-15", cohortSize: 500, d1: 0.45, d7: 0.28, d30: 0.15 },
  { cohortDate: "2024-01-08", cohortSize: 480, d1: 0.42, d7: 0.25, d30: 0.12 },
  { cohortDate: "2024-01-01", cohortSize: 520, d1: 0.48, d7: 0.30, d30: 0.18 },
  { cohortDate: "2023-12-25", cohortSize: 380, d1: 0.35, d7: 0.20, d30: 0.10 },
  { cohortDate: "2023-12-18", cohortSize: 450, d1: 0.43, d7: 0.27, d30: 0.14 },
];

const anomalies: Anomaly[] = [
  { date: "2024-01-20", metric: "DAU", severity: "medium", message: "DAU dropped 25% below 30-day average" },
  { date: "2024-01-18", metric: "Volume", severity: "low", message: "Trading volume increased 45% above average" },
];

const growthDrivers = [
  { name: "Referral Program", impact: 35, trend: "up" as const },
  { name: "Trading Volume", impact: 28, trend: "up" as const },
  { name: "First Deposits", impact: 22, trend: "stable" as const },
  { name: "KYC Completion", impact: 15, trend: "down" as const },
];

// ============================================================================
// Components
// ============================================================================

function MetricCardComponent({ metric }: { metric: MetricCard }) {
  const trendColor = metric.trend === "up" ? "text-green-500" : metric.trend === "down" ? "text-red-500" : "text-gray-500";
  const trendIcon = metric.trend === "up" ? "↑" : metric.trend === "down" ? "↓" : "→";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{metric.title}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{metric.value}</div>
        <div className={`text-sm ${trendColor} flex items-center gap-1`}>
          <span>{trendIcon}</span>
          <span>{Math.abs(metric.change)}%</span>
          <span className="text-muted-foreground">{metric.changeLabel}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function SparklineChart({ data, color = "bg-primary" }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  return (
    <div className="flex items-end h-12 gap-0.5">
      {data.map((value, i) => (
        <div
          key={i}
          className={`w-2 ${color} rounded-t opacity-70`}
          style={{ height: `${((value - min) / range) * 100}%`, minHeight: "4px" }}
        />
      ))}
    </div>
  );
}

function FunnelVisualization({ steps }: { steps: FunnelStep[] }) {
  const maxCount = steps[0]?.count || 1;

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={step.name} className="flex items-center gap-4">
          <div className="w-32 text-sm font-medium truncate">{step.name}</div>
          <div className="flex-1">
            <div className="h-8 bg-muted rounded-lg overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 flex items-center justify-end pr-2"
                style={{ width: `${(step.count / maxCount) * 100}%` }}
              >
                <span className="text-xs text-primary-foreground font-medium">
                  {step.count.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          <div className="w-16 text-right">
            <span className={`text-sm ${step.dropoffRate > 0.3 ? "text-red-500" : "text-muted-foreground"}`}>
              {step.dropoffRate > 0 ? `-${(step.dropoffRate * 100).toFixed(0)}%` : "-"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RetentionHeatmap({ cohorts }: { cohorts: RetentionCohort[] }) {
  const getRetentionColor = (value: number) => {
    if (value >= 0.4) return "bg-green-500";
    if (value >= 0.3) return "bg-green-400";
    if (value >= 0.2) return "bg-yellow-400";
    if (value >= 0.1) return "bg-orange-400";
    return "bg-red-400";
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left py-2 px-3">Cohort</th>
            <th className="text-center py-2 px-3">Size</th>
            <th className="text-center py-2 px-3">D1</th>
            <th className="text-center py-2 px-3">D7</th>
            <th className="text-center py-2 px-3">D30</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((cohort) => (
            <tr key={cohort.cohortDate} className="border-t">
              <td className="py-2 px-3 font-medium">{cohort.cohortDate}</td>
              <td className="py-2 px-3 text-center text-muted-foreground">
                {cohort.cohortSize}
              </td>
              <td className="py-2 px-3 text-center">
                <span className={`inline-block px-2 py-1 rounded text-white text-xs ${getRetentionColor(cohort.d1)}`}>
                  {(cohort.d1 * 100).toFixed(0)}%
                </span>
              </td>
              <td className="py-2 px-3 text-center">
                <span className={`inline-block px-2 py-1 rounded text-white text-xs ${getRetentionColor(cohort.d7)}`}>
                  {(cohort.d7 * 100).toFixed(0)}%
                </span>
              </td>
              <td className="py-2 px-3 text-center">
                <span className={`inline-block px-2 py-1 rounded text-white text-xs ${getRetentionColor(cohort.d30)}`}>
                  {(cohort.d30 * 100).toFixed(0)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function AnalyticsDashboardPage() {
  const [dateRange, setDateRange] = useState("7d");

  // Placeholder sparkline data
  const dauSparkline = [1200, 1350, 1280, 1400, 1520, 1480, 1600];
  const volumeSparkline = [2.1, 1.8, 2.4, 2.2, 2.5, 2.3, 2.4];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
          <p className="text-muted-foreground">Track key metrics and growth drivers</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={dateRange === "7d" ? "default" : "outline"}
            size="sm"
            onClick={() => setDateRange("7d")}
          >
            7 Days
          </Button>
          <Button
            variant={dateRange === "30d" ? "default" : "outline"}
            size="sm"
            onClick={() => setDateRange("30d")}
          >
            30 Days
          </Button>
          <Button
            variant={dateRange === "90d" ? "default" : "outline"}
            size="sm"
            onClick={() => setDateRange("90d")}
          >
            90 Days
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metricsCards.map((metric) => (
          <MetricCardComponent key={metric.title} metric={metric} />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* DAU Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Active Users</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <SparklineChart data={dauSparkline} />
            <div className="mt-4 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-muted-foreground">Avg DAU</p>
                <p className="font-medium">1,404</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">WAU</p>
                <p className="font-medium">8,420</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">DAU/MAU</p>
                <p className="font-medium">32%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Volume Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Trading Volume</CardTitle>
            <CardDescription>Last 7 days (millions USD)</CardDescription>
          </CardHeader>
          <CardContent>
            <SparklineChart data={volumeSparkline} color="bg-green-500" />
            <div className="mt-4 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-muted-foreground">Avg Daily</p>
                <p className="font-medium">$2.2M</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Weekly</p>
                <p className="font-medium">$15.4M</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fees</p>
                <p className="font-medium">$154K</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Funnel & Retention Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Conversion Funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Conversion Funnel</CardTitle>
            <CardDescription>
              Signup to first trade - Overall conversion: 26.1%
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FunnelVisualization steps={funnelSteps} />
          </CardContent>
        </Card>

        {/* Retention Heatmap */}
        <Card>
          <CardHeader>
            <CardTitle>Retention Cohorts</CardTitle>
            <CardDescription>D1, D7, D30 retention by signup week</CardDescription>
          </CardHeader>
          <CardContent>
            <RetentionHeatmap cohorts={retentionCohorts} />
          </CardContent>
        </Card>
      </div>

      {/* Growth Drivers & Anomalies */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Growth Drivers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Growth Drivers</CardTitle>
            <CardDescription>Factors contributing to growth this week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {growthDrivers.map((driver) => (
                <div key={driver.name} className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{driver.name}</span>
                      <span className="text-sm text-muted-foreground">{driver.impact}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          driver.trend === "up"
                            ? "bg-green-500"
                            : driver.trend === "down"
                            ? "bg-red-500"
                            : "bg-yellow-500"
                        }`}
                        style={{ width: `${driver.impact}%` }}
                      />
                    </div>
                  </div>
                  <Badge
                    variant={
                      driver.trend === "up"
                        ? "default"
                        : driver.trend === "down"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {driver.trend === "up" ? "↑" : driver.trend === "down" ? "↓" : "→"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Anomalies */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Anomalies</CardTitle>
            <CardDescription>Detected metric deviations</CardDescription>
          </CardHeader>
          <CardContent>
            {anomalies.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No anomalies detected
              </p>
            ) : (
              <div className="space-y-4">
                {anomalies.map((anomaly, i) => (
                  <div
                    key={i}
                    className={`p-4 rounded-lg border ${
                      anomaly.severity === "high"
                        ? "border-red-500 bg-red-500/10"
                        : anomaly.severity === "medium"
                        ? "border-yellow-500 bg-yellow-500/10"
                        : "border-blue-500 bg-blue-500/10"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{anomaly.metric}</span>
                      <Badge
                        variant={
                          anomaly.severity === "high"
                            ? "destructive"
                            : anomaly.severity === "medium"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {anomaly.severity}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{anomaly.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{anomaly.date}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="flex items-center gap-4">
        <Button variant="outline">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Report
        </Button>
        <Button variant="outline">
          View Experiments →
        </Button>
      </div>
    </div>
  );
}
