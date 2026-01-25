"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pull/ui";
import { Badge } from "@pull/ui";
import { Button } from "@pull/ui";
import { Input } from "@pull/ui";

// ============================================================================
// Types
// ============================================================================

interface FraudFlag {
  _id: string;
  userId: string;
  userEmail?: string;
  userDisplayName?: string;
  type: string;
  resourceType: string;
  resourceId: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "pending" | "investigating" | "confirmed" | "cleared" | "escalated";
  description: string;
  timestamp: number;
  metadata?: {
    flaggedBy?: string;
    reviewedBy?: string;
    reviewedAt?: number;
    reviewNotes?: string;
    actionTaken?: string;
    amount?: number;
    ipAddress?: string;
    deviceInfo?: string;
    relatedTransactions?: string[];
  };
}

// ============================================================================
// Placeholder Data
// ============================================================================

const sampleFraudFlags: FraudFlag[] = [
  {
    _id: "ff1",
    userId: "user1",
    userEmail: "suspicious@example.com",
    userDisplayName: "Suspicious User",
    type: "fraud.velocity",
    resourceType: "withdrawals",
    resourceId: "wd1",
    severity: "critical",
    status: "pending",
    description: "Multiple withdrawal attempts in short timeframe (5 in 10 minutes)",
    timestamp: Date.now() - 1800000,
    metadata: {
      flaggedBy: "system",
      amount: 150000,
      relatedTransactions: ["wd1", "wd2", "wd3", "wd4", "wd5"],
    },
  },
  {
    _id: "ff2",
    userId: "user2",
    userEmail: "new@example.com",
    userDisplayName: "New User",
    type: "fraud.device_mismatch",
    resourceType: "users",
    resourceId: "user2",
    severity: "high",
    status: "investigating",
    description: "Login from new device in different country than registration",
    timestamp: Date.now() - 3600000,
    metadata: {
      flaggedBy: "system",
      ipAddress: "192.168.1.100",
      deviceInfo: "iPhone 15 Pro, iOS 17.2",
      reviewedBy: "admin1",
      reviewedAt: Date.now() - 3000000,
    },
  },
  {
    _id: "ff3",
    userId: "user3",
    userEmail: "trader@example.com",
    userDisplayName: "Pro Trader",
    type: "fraud.large_transaction",
    resourceType: "orders",
    resourceId: "order1",
    severity: "medium",
    status: "pending",
    description: "Single order exceeds $100,000 threshold",
    timestamp: Date.now() - 7200000,
    metadata: {
      flaggedBy: "system",
      amount: 125000,
    },
  },
  {
    _id: "ff4",
    userId: "user4",
    userEmail: "john@example.com",
    userDisplayName: "John Doe",
    type: "fraud.aml_screening",
    resourceType: "deposits",
    resourceId: "dep1",
    severity: "high",
    status: "escalated",
    description: "Deposit source flagged by AML screening - potential sanctions match",
    timestamp: Date.now() - 86400000,
    metadata: {
      flaggedBy: "chainalysis",
      amount: 50000,
      reviewedBy: "admin2",
      reviewedAt: Date.now() - 82800000,
      reviewNotes: "Escalated to compliance team for review",
    },
  },
  {
    _id: "ff5",
    userId: "user5",
    userEmail: "whale@example.com",
    userDisplayName: "Whale Trader",
    type: "fraud.unusual_pattern",
    resourceType: "orders",
    resourceId: "order2",
    severity: "low",
    status: "cleared",
    description: "Unusual trading pattern detected - potential wash trading",
    timestamp: Date.now() - 172800000,
    metadata: {
      flaggedBy: "system",
      reviewedBy: "admin1",
      reviewedAt: Date.now() - 86400000,
      reviewNotes: "Reviewed trading history - pattern consistent with market making strategy",
      actionTaken: "No action needed",
    },
  },
  {
    _id: "ff6",
    userId: "user6",
    userEmail: "bad@example.com",
    userDisplayName: "Bad Actor",
    type: "fraud.identity",
    resourceType: "users",
    resourceId: "user6",
    severity: "critical",
    status: "confirmed",
    description: "Multiple accounts detected with same identity documents",
    timestamp: Date.now() - 259200000,
    metadata: {
      flaggedBy: "persona",
      reviewedBy: "admin2",
      reviewedAt: Date.now() - 172800000,
      reviewNotes: "Confirmed - user created 3 accounts with same ID",
      actionTaken: "All accounts suspended, funds frozen",
    },
  },
];

// ============================================================================
// Components
// ============================================================================

function SeverityBadge({ severity }: { severity: FraudFlag["severity"] }) {
  const config: Record<FraudFlag["severity"], { color: string; label: string }> = {
    low: { color: "bg-blue-500/10 text-blue-500 border-blue-500/50", label: "Low" },
    medium: { color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/50", label: "Medium" },
    high: { color: "bg-orange-500/10 text-orange-500 border-orange-500/50", label: "High" },
    critical: { color: "bg-red-500/10 text-red-500 border-red-500/50", label: "Critical" },
  };

  const { color, label } = config[severity];
  return <span className={`px-2 py-0.5 rounded text-xs border font-medium ${color}`}>{label}</span>;
}

function StatusBadge({ status }: { status: FraudFlag["status"] }) {
  const config: Record<FraudFlag["status"], { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    pending: { variant: "secondary", label: "Pending Review" },
    investigating: { variant: "default", label: "Investigating" },
    confirmed: { variant: "destructive", label: "Confirmed Fraud" },
    cleared: { variant: "outline", label: "Cleared" },
    escalated: { variant: "default", label: "Escalated" },
  };

  const { variant, label } = config[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function FraudFlagsTable({
  flags,
  onSelectFlag,
  selectedFlagId,
}: {
  flags: FraudFlag[];
  onSelectFlag: (flag: FraudFlag) => void;
  selectedFlagId?: string;
}) {
  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      "fraud.velocity": "Velocity",
      "fraud.device_mismatch": "Device",
      "fraud.large_transaction": "Large TX",
      "fraud.aml_screening": "AML",
      "fraud.unusual_pattern": "Pattern",
      "fraud.identity": "Identity",
    };
    return labels[type] || type.split(".").pop() || type;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-4">Severity</th>
            <th className="text-left py-3 px-4">Type</th>
            <th className="text-left py-3 px-4">User</th>
            <th className="text-left py-3 px-4">Description</th>
            <th className="text-left py-3 px-4">Status</th>
            <th className="text-left py-3 px-4">Flagged</th>
            <th className="text-right py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((flag) => (
            <tr
              key={flag._id}
              className={`border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                selectedFlagId === flag._id ? "bg-muted" : ""
              } ${flag.severity === "critical" && flag.status === "pending" ? "bg-red-500/5" : ""}`}
              onClick={() => onSelectFlag(flag)}
            >
              <td className="py-3 px-4">
                <SeverityBadge severity={flag.severity} />
              </td>
              <td className="py-3 px-4">
                <span className="px-2 py-0.5 bg-muted rounded text-xs">
                  {getTypeLabel(flag.type)}
                </span>
              </td>
              <td className="py-3 px-4">
                <div>
                  <p className="font-medium text-sm">{flag.userDisplayName || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{flag.userEmail}</p>
                </div>
              </td>
              <td className="py-3 px-4">
                <p className="text-sm truncate max-w-[250px]" title={flag.description}>
                  {flag.description}
                </p>
              </td>
              <td className="py-3 px-4">
                <StatusBadge status={flag.status} />
              </td>
              <td className="py-3 px-4 text-muted-foreground text-xs">
                {formatTimeAgo(flag.timestamp)}
              </td>
              <td className="py-3 px-4 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectFlag(flag);
                  }}
                >
                  Review
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FraudDetailsPanel({
  flag,
  onClose,
  onReview,
}: {
  flag: FraudFlag;
  onClose: () => void;
  onReview: (flagId: string, status: FraudFlag["status"], notes: string, actionTaken?: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<FraudFlag["status"]>("investigating");

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleString();
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      "fraud.velocity": "Velocity Alert",
      "fraud.device_mismatch": "Device Mismatch",
      "fraud.large_transaction": "Large Transaction",
      "fraud.aml_screening": "AML Screening",
      "fraud.unusual_pattern": "Unusual Pattern",
      "fraud.identity": "Identity Fraud",
    };
    return labels[type] || type;
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle>Fraud Alert</CardTitle>
            <SeverityBadge severity={flag.severity} />
          </div>
          <CardDescription>{getTypeLabel(flag.type)}</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <span className="text-sm font-medium">Current Status</span>
          <StatusBadge status={flag.status} />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <h4 className="font-medium">Description</h4>
          <p className="text-sm p-3 bg-muted rounded-lg">{flag.description}</p>
        </div>

        {/* User Info */}
        <div className="space-y-4">
          <h4 className="font-medium">User</h4>
          <div className="p-4 border rounded-lg">
            <p className="font-medium">{flag.userDisplayName || "Unknown"}</p>
            <p className="text-sm text-muted-foreground">{flag.userEmail}</p>
            <p className="text-xs text-muted-foreground mt-1">ID: {flag.userId}</p>
          </div>
        </div>

        {/* Additional Details */}
        <div className="space-y-4">
          <h4 className="font-medium">Details</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="text-muted-foreground">Resource Type</label>
              <p className="font-medium capitalize">{flag.resourceType}</p>
            </div>
            <div>
              <label className="text-muted-foreground">Resource ID</label>
              <p className="font-mono text-xs">{flag.resourceId}</p>
            </div>
            {flag.metadata?.amount && (
              <div>
                <label className="text-muted-foreground">Amount</label>
                <p className="font-medium">${flag.metadata.amount.toLocaleString()}</p>
              </div>
            )}
            {flag.metadata?.flaggedBy && (
              <div>
                <label className="text-muted-foreground">Flagged By</label>
                <p className="font-medium capitalize">{flag.metadata.flaggedBy}</p>
              </div>
            )}
            {flag.metadata?.ipAddress && (
              <div>
                <label className="text-muted-foreground">IP Address</label>
                <p className="font-mono text-xs">{flag.metadata.ipAddress}</p>
              </div>
            )}
            {flag.metadata?.deviceInfo && (
              <div className="col-span-2">
                <label className="text-muted-foreground">Device</label>
                <p className="text-sm">{flag.metadata.deviceInfo}</p>
              </div>
            )}
          </div>
        </div>

        {/* Related Transactions */}
        {flag.metadata?.relatedTransactions && flag.metadata.relatedTransactions.length > 0 && (
          <div className="space-y-4">
            <h4 className="font-medium">Related Transactions</h4>
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex flex-wrap gap-2">
                {flag.metadata.relatedTransactions.map((txId) => (
                  <span key={txId} className="px-2 py-1 bg-background rounded text-xs font-mono">
                    {txId}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Previous Review */}
        {flag.metadata?.reviewedBy && (
          <div className="space-y-4">
            <h4 className="font-medium">Previous Review</h4>
            <div className="p-4 border rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reviewed by</span>
                <span>{flag.metadata.reviewedBy}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reviewed at</span>
                <span>{formatDate(flag.metadata.reviewedAt)}</span>
              </div>
              {flag.metadata.reviewNotes && (
                <div className="pt-2 border-t">
                  <p className="text-muted-foreground mb-1">Notes:</p>
                  <p>{flag.metadata.reviewNotes}</p>
                </div>
              )}
              {flag.metadata.actionTaken && (
                <div className="pt-2 border-t">
                  <p className="text-muted-foreground mb-1">Action taken:</p>
                  <p>{flag.metadata.actionTaken}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Review Form */}
        {(flag.status === "pending" || flag.status === "investigating") && (
          <div className="pt-4 border-t space-y-4">
            <h4 className="font-medium">Review & Take Action</h4>

            {/* Status Selection */}
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Update Status</label>
              <div className="flex flex-wrap gap-2">
                {(["investigating", "confirmed", "cleared", "escalated"] as const).map((status) => (
                  <Button
                    key={status}
                    variant={selectedStatus === status ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedStatus(status)}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Review Notes</label>
              <textarea
                className="w-full p-3 border rounded-lg text-sm resize-none"
                rows={3}
                placeholder="Enter your review notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Action Taken */}
            {(selectedStatus === "confirmed" || selectedStatus === "cleared") && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Action Taken</label>
                <Input
                  placeholder="e.g., Account suspended, Funds frozen, No action needed"
                  value={actionTaken}
                  onChange={(e) => setActionTaken(e.target.value)}
                />
              </div>
            )}

            {/* Submit */}
            <Button
              className="w-full"
              onClick={() => onReview(flag._id, selectedStatus, notes, actionTaken || undefined)}
              disabled={!notes}
            >
              Submit Review
            </Button>
          </div>
        )}

        {/* Timeline */}
        <div className="space-y-4">
          <h4 className="font-medium">Timeline</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Flagged</span>
              <span>{formatDate(flag.timestamp)}</span>
            </div>
            {flag.metadata?.reviewedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Reviewed</span>
                <span>{formatDate(flag.metadata.reviewedAt)}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function FraudReviewPage() {
  const searchParams = useSearchParams();

  const [flags, setFlags] = useState<FraudFlag[]>(sampleFraudFlags);
  const [filteredFlags, setFilteredFlags] = useState<FraudFlag[]>(sampleFraudFlags);
  const [selectedFlag, setSelectedFlag] = useState<FraudFlag | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  // Handle URL params
  useEffect(() => {
    const status = searchParams.get("status");
    const severity = searchParams.get("severity");

    if (status) setStatusFilter(status);
    if (severity) setSeverityFilter(severity);
  }, [searchParams]);

  // Filter flags
  useEffect(() => {
    let filtered = flags;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (f) =>
          f._id.toLowerCase().includes(query) ||
          f.userEmail?.toLowerCase().includes(query) ||
          f.userDisplayName?.toLowerCase().includes(query) ||
          f.description.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((f) => f.status === statusFilter);
    }

    if (severityFilter !== "all") {
      filtered = filtered.filter((f) => f.severity === severityFilter);
    }

    // Sort by severity (critical first) then by timestamp
    filtered.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.timestamp - a.timestamp;
    });

    setFilteredFlags(filtered);
  }, [flags, searchQuery, statusFilter, severityFilter]);

  const handleReview = async (
    flagId: string,
    status: FraudFlag["status"],
    notes: string,
    actionTaken?: string
  ) => {
    setLoading(true);
    // In production, call API
    console.log("Reviewing flag:", flagId, "Status:", status, "Notes:", notes, "Action:", actionTaken);

    setFlags((prev) =>
      prev.map((f) =>
        f._id === flagId
          ? {
              ...f,
              status,
              metadata: {
                ...f.metadata,
                reviewedBy: "current_admin",
                reviewedAt: Date.now(),
                reviewNotes: notes,
                actionTaken,
              },
            }
          : f
      )
    );
    setSelectedFlag((prev) =>
      prev?._id === flagId
        ? {
            ...prev,
            status,
            metadata: {
              ...prev.metadata,
              reviewedBy: "current_admin",
              reviewedAt: Date.now(),
              reviewNotes: notes,
              actionTaken,
            },
          }
        : prev
    );
    setLoading(false);
  };

  // Calculate stats
  const criticalPending = flags.filter((f) => f.severity === "critical" && f.status === "pending").length;
  const highPending = flags.filter((f) => f.severity === "high" && f.status === "pending").length;

  const statusCounts: Record<string, number> = {
    all: flags.length,
    pending: flags.filter((f) => f.status === "pending").length,
    investigating: flags.filter((f) => f.status === "investigating").length,
    confirmed: flags.filter((f) => f.status === "confirmed").length,
    cleared: flags.filter((f) => f.status === "cleared").length,
    escalated: flags.filter((f) => f.status === "escalated").length,
  };

  const severityCounts: Record<string, number> = {
    all: flags.length,
    critical: flags.filter((f) => f.severity === "critical").length,
    high: flags.filter((f) => f.severity === "high").length,
    medium: flags.filter((f) => f.severity === "medium").length,
    low: flags.filter((f) => f.severity === "low").length,
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fraud Review</h1>
          <p className="text-muted-foreground">Review and investigate fraud alerts</p>
        </div>
        <Button variant="outline">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Report
        </Button>
      </div>

      {/* Critical Alert Banner */}
      {criticalPending > 0 && (
        <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-medium text-red-500">
                {criticalPending} CRITICAL alert{criticalPending > 1 ? "s" : ""} pending review
              </p>
              <p className="text-sm text-muted-foreground">
                {highPending > 0 && `Plus ${highPending} high severity alerts`}
              </p>
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setStatusFilter("pending");
              setSeverityFilter("critical");
            }}
          >
            Review Critical
          </Button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{flags.length}</div>
          </CardContent>
        </Card>
        <Card className="border-red-500/50">
          <CardHeader className="pb-2">
            <CardDescription>Critical</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{severityCounts.critical}</div>
            <p className="text-xs text-muted-foreground">
              {criticalPending} pending
            </p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/50">
          <CardHeader className="pb-2">
            <CardDescription>High</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{severityCounts.high}</div>
            <p className="text-xs text-muted-foreground">
              {highPending} pending
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Confirmed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.confirmed}</div>
            <p className="text-xs text-muted-foreground">Fraud cases</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cleared</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.cleared}</div>
            <p className="text-xs text-muted-foreground">False positives</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by ID, user, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Status Filter */}
              <div className="flex items-center gap-1 border rounded-lg p-1 overflow-x-auto">
                {["all", "pending", "investigating", "escalated"].map((status) => (
                  <Button
                    key={status}
                    variant={statusFilter === status ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setStatusFilter(status)}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)} ({statusCounts[status] || 0})
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {/* Severity Filter */}
            <div className="flex items-center gap-1 border rounded-lg p-1">
              {["all", "critical", "high", "medium", "low"].map((severity) => (
                <Button
                  key={severity}
                  variant={severityFilter === severity ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSeverityFilter(severity)}
                  className={
                    severity === "critical" && severityFilter === severity
                      ? "bg-red-500 hover:bg-red-600"
                      : severity === "high" && severityFilter === severity
                      ? "bg-orange-500 hover:bg-orange-600"
                      : ""
                  }
                >
                  {severity.charAt(0).toUpperCase() + severity.slice(1)} ({severityCounts[severity] || 0})
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Flags List */}
        <div className={selectedFlag ? "lg:col-span-2" : "lg:col-span-3"}>
          <Card>
            <CardHeader>
              <CardTitle>Fraud Alerts ({filteredFlags.length})</CardTitle>
              <CardDescription>
                Click on an alert to review details and take action
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredFlags.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No fraud alerts found matching your criteria</p>
                </div>
              ) : (
                <FraudFlagsTable
                  flags={filteredFlags}
                  onSelectFlag={setSelectedFlag}
                  selectedFlagId={selectedFlag?._id}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Flag Details Panel */}
        {selectedFlag && (
          <div className="lg:col-span-1">
            <FraudDetailsPanel
              flag={selectedFlag}
              onClose={() => setSelectedFlag(null)}
              onReview={handleReview}
            />
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {filteredFlags.length} of {flags.length} alerts
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
