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

interface Withdrawal {
  _id: string;
  userId: string;
  userEmail?: string;
  userDisplayName?: string;
  method: "bank_transfer" | "wire" | "crypto";
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  amount: number;
  currency: string;
  fee: number;
  netAmount: number;
  destination: string;
  externalId?: string;
  txHash?: string;
  metadata?: {
    provider?: string;
    processorId?: string;
    notes?: string;
    rejectionReason?: string;
  };
  createdAt: number;
  completedAt?: number;
}

// ============================================================================
// Placeholder Data
// ============================================================================

const sampleWithdrawals: Withdrawal[] = [
  {
    _id: "wd1",
    userId: "user1",
    userEmail: "whale@example.com",
    userDisplayName: "Whale Trader",
    method: "wire",
    status: "pending",
    amount: 50000,
    currency: "USD",
    fee: 25,
    netAmount: 49975,
    destination: "Bank of America ****1234",
    createdAt: Date.now() - 3600000,
  },
  {
    _id: "wd2",
    userId: "user2",
    userEmail: "john@example.com",
    userDisplayName: "John Doe",
    method: "crypto",
    status: "pending",
    amount: 5000,
    currency: "USDC",
    fee: 5,
    netAmount: 4995,
    destination: "0x1234...abcd",
    createdAt: Date.now() - 7200000,
  },
  {
    _id: "wd3",
    userId: "user3",
    userEmail: "jane@example.com",
    userDisplayName: "Jane Smith",
    method: "bank_transfer",
    status: "processing",
    amount: 2500,
    currency: "USD",
    fee: 0,
    netAmount: 2500,
    destination: "Chase ****5678",
    createdAt: Date.now() - 14400000,
  },
  {
    _id: "wd4",
    userId: "user4",
    userEmail: "trader@example.com",
    userDisplayName: "Pro Trader",
    method: "wire",
    status: "completed",
    amount: 25000,
    currency: "USD",
    fee: 25,
    netAmount: 24975,
    destination: "Wells Fargo ****9012",
    externalId: "WF-123456",
    createdAt: Date.now() - 86400000,
    completedAt: Date.now() - 82800000,
  },
  {
    _id: "wd5",
    userId: "user5",
    userEmail: "suspicious@example.com",
    userDisplayName: "Suspicious User",
    method: "crypto",
    status: "cancelled",
    amount: 100000,
    currency: "USDT",
    fee: 10,
    netAmount: 99990,
    destination: "0x5678...efgh",
    metadata: {
      rejectionReason: "Failed AML screening",
    },
    createdAt: Date.now() - 172800000,
  },
  {
    _id: "wd6",
    userId: "user1",
    userEmail: "whale@example.com",
    userDisplayName: "Whale Trader",
    method: "bank_transfer",
    status: "pending",
    amount: 15000,
    currency: "USD",
    fee: 0,
    netAmount: 15000,
    destination: "Bank of America ****1234",
    createdAt: Date.now() - 1800000,
  },
];

// ============================================================================
// Components
// ============================================================================

function WithdrawalStatusBadge({ status }: { status: Withdrawal["status"] }) {
  const config: Record<Withdrawal["status"], { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    pending: { variant: "secondary", label: "Pending Approval" },
    processing: { variant: "default", label: "Processing" },
    completed: { variant: "default", label: "Completed" },
    failed: { variant: "destructive", label: "Failed" },
    cancelled: { variant: "outline", label: "Cancelled" },
  };

  const { variant, label } = config[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function MethodBadge({ method }: { method: Withdrawal["method"] }) {
  const config: Record<Withdrawal["method"], string> = {
    bank_transfer: "bg-blue-500/10 text-blue-500 border-blue-500/50",
    wire: "bg-purple-500/10 text-purple-500 border-purple-500/50",
    crypto: "bg-orange-500/10 text-orange-500 border-orange-500/50",
  };

  const labels: Record<Withdrawal["method"], string> = {
    bank_transfer: "Bank Transfer",
    wire: "Wire",
    crypto: "Crypto",
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs border ${config[method]}`}>
      {labels[method]}
    </span>
  );
}

function WithdrawalsTable({
  withdrawals,
  onSelectWithdrawal,
  selectedWithdrawalId,
  onApprove,
  onReject,
}: {
  withdrawals: Withdrawal[];
  onSelectWithdrawal: (withdrawal: Withdrawal) => void;
  selectedWithdrawalId?: string;
  onApprove: (withdrawalId: string) => void;
  onReject: (withdrawalId: string) => void;
}) {
  const formatCurrency = (value: number, currency: string) => {
    if (["USDC", "USDT", "BTC", "ETH"].includes(currency)) {
      return `${value.toLocaleString()} ${currency}`;
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    }).format(value);
  };

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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-4">User</th>
            <th className="text-left py-3 px-4">Method</th>
            <th className="text-right py-3 px-4">Amount</th>
            <th className="text-left py-3 px-4">Destination</th>
            <th className="text-left py-3 px-4">Status</th>
            <th className="text-left py-3 px-4">Requested</th>
            <th className="text-right py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {withdrawals.map((withdrawal) => (
            <tr
              key={withdrawal._id}
              className={`border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                selectedWithdrawalId === withdrawal._id ? "bg-muted" : ""
              }`}
              onClick={() => onSelectWithdrawal(withdrawal)}
            >
              <td className="py-3 px-4">
                <div>
                  <p className="font-medium">{withdrawal.userDisplayName || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{withdrawal.userEmail}</p>
                </div>
              </td>
              <td className="py-3 px-4">
                <MethodBadge method={withdrawal.method} />
              </td>
              <td className="py-3 px-4 text-right">
                <div>
                  <p className="font-medium font-mono">
                    {formatCurrency(withdrawal.amount, withdrawal.currency)}
                  </p>
                  {withdrawal.fee > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Fee: {formatCurrency(withdrawal.fee, withdrawal.currency)}
                    </p>
                  )}
                </div>
              </td>
              <td className="py-3 px-4">
                <p className="font-mono text-xs truncate max-w-[150px]" title={withdrawal.destination}>
                  {withdrawal.destination}
                </p>
              </td>
              <td className="py-3 px-4">
                <WithdrawalStatusBadge status={withdrawal.status} />
              </td>
              <td className="py-3 px-4 text-muted-foreground text-xs">
                {formatTimeAgo(withdrawal.createdAt)}
              </td>
              <td className="py-3 px-4 text-right">
                {withdrawal.status === "pending" && (
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onApprove(withdrawal._id);
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReject(withdrawal._id);
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                )}
                {withdrawal.status !== "pending" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectWithdrawal(withdrawal);
                    }}
                  >
                    View
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WithdrawalDetailsPanel({
  withdrawal,
  onClose,
  onApprove,
  onReject,
}: {
  withdrawal: Withdrawal;
  onClose: () => void;
  onApprove: (withdrawalId: string) => void;
  onReject: (withdrawalId: string, reason: string) => void;
}) {
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);

  const formatCurrency = (value: number, currency: string) => {
    if (["USDC", "USDT", "BTC", "ETH"].includes(currency)) {
      return `${value.toLocaleString()} ${currency}`;
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            Withdrawal Request
          </CardTitle>
          <CardDescription>ID: {withdrawal._id}</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status & Amount */}
        <div className="p-4 bg-muted rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Status</span>
            <WithdrawalStatusBadge status={withdrawal.status} />
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold">
              {formatCurrency(withdrawal.amount, withdrawal.currency)}
            </p>
            {withdrawal.fee > 0 && (
              <p className="text-sm text-muted-foreground">
                Net: {formatCurrency(withdrawal.netAmount, withdrawal.currency)} (Fee: {formatCurrency(withdrawal.fee, withdrawal.currency)})
              </p>
            )}
          </div>
        </div>

        {/* User Info */}
        <div className="space-y-4">
          <h4 className="font-medium">User</h4>
          <div className="p-4 border rounded-lg">
            <p className="font-medium">{withdrawal.userDisplayName || "Unknown"}</p>
            <p className="text-sm text-muted-foreground">{withdrawal.userEmail}</p>
            <p className="text-xs text-muted-foreground mt-1">ID: {withdrawal.userId}</p>
          </div>
        </div>

        {/* Withdrawal Details */}
        <div className="space-y-4">
          <h4 className="font-medium">Details</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="text-muted-foreground">Method</label>
              <div className="mt-1">
                <MethodBadge method={withdrawal.method} />
              </div>
            </div>
            <div>
              <label className="text-muted-foreground">Currency</label>
              <p className="font-medium">{withdrawal.currency}</p>
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Destination</label>
            <p className="font-mono text-sm p-2 bg-muted rounded mt-1 break-all">
              {withdrawal.destination}
            </p>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-4">
          <h4 className="font-medium">Timeline</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Requested</span>
              <span>{formatDate(withdrawal.createdAt)}</span>
            </div>
            {withdrawal.completedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Completed</span>
                <span>{formatDate(withdrawal.completedAt)}</span>
              </div>
            )}
          </div>
        </div>

        {/* External IDs */}
        {(withdrawal.externalId || withdrawal.txHash) && (
          <div className="space-y-4">
            <h4 className="font-medium">External References</h4>
            <div className="space-y-2 text-sm">
              {withdrawal.externalId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">External ID</span>
                  <span className="font-mono">{withdrawal.externalId}</span>
                </div>
              )}
              {withdrawal.txHash && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TX Hash</span>
                  <span className="font-mono text-xs">{withdrawal.txHash}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rejection Reason */}
        {withdrawal.metadata?.rejectionReason && (
          <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
            <h4 className="font-medium text-red-500 mb-2">Rejection Reason</h4>
            <p className="text-sm">{withdrawal.metadata.rejectionReason}</p>
          </div>
        )}

        {/* Actions */}
        {withdrawal.status === "pending" && (
          <div className="pt-4 border-t space-y-2">
            <h4 className="font-medium">Actions</h4>
            <div className="flex gap-2">
              <Button
                variant="default"
                className="flex-1"
                onClick={() => onApprove(withdrawal._id)}
              >
                Approve Withdrawal
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => setShowRejectModal(true)}
              >
                Reject Withdrawal
              </Button>
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {showRejectModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background rounded-lg p-6 max-w-md w-full m-4">
              <h3 className="font-bold text-lg mb-4">Reject Withdrawal</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Please provide a reason for rejecting this withdrawal. The user will be notified.
              </p>
              <Input
                placeholder="Rejection reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="mb-4"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowRejectModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    onReject(withdrawal._id, rejectReason);
                    setShowRejectModal(false);
                    setRejectReason("");
                  }}
                  disabled={!rejectReason}
                >
                  Reject
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function WithdrawalsApprovalPage() {
  const searchParams = useSearchParams();

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>(sampleWithdrawals);
  const [filteredWithdrawals, setFilteredWithdrawals] = useState<Withdrawal[]>(sampleWithdrawals);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  // Handle URL params
  useEffect(() => {
    const status = searchParams.get("status");
    if (status) setStatusFilter(status);
  }, [searchParams]);

  // Filter withdrawals
  useEffect(() => {
    let filtered = withdrawals;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (w) =>
          w._id.toLowerCase().includes(query) ||
          w.userEmail?.toLowerCase().includes(query) ||
          w.userDisplayName?.toLowerCase().includes(query) ||
          w.destination.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((w) => w.status === statusFilter);
    }

    if (methodFilter !== "all") {
      filtered = filtered.filter((w) => w.method === methodFilter);
    }

    setFilteredWithdrawals(filtered);
  }, [withdrawals, searchQuery, statusFilter, methodFilter]);

  const handleApprove = async (withdrawalId: string) => {
    setLoading(true);
    // In production, call API
    console.log("Approving withdrawal:", withdrawalId);

    setWithdrawals((prev) =>
      prev.map((w) => (w._id === withdrawalId ? { ...w, status: "processing" as const } : w))
    );
    setSelectedWithdrawal((prev) =>
      prev?._id === withdrawalId ? { ...prev, status: "processing" as const } : prev
    );
    setLoading(false);
  };

  const handleReject = async (withdrawalId: string, reason: string) => {
    setLoading(true);
    // In production, call API
    console.log("Rejecting withdrawal:", withdrawalId, "Reason:", reason);

    setWithdrawals((prev) =>
      prev.map((w) =>
        w._id === withdrawalId
          ? { ...w, status: "cancelled" as const, metadata: { ...w.metadata, rejectionReason: reason } }
          : w
      )
    );
    setSelectedWithdrawal((prev) =>
      prev?._id === withdrawalId
        ? { ...prev, status: "cancelled" as const, metadata: { ...prev.metadata, rejectionReason: reason } }
        : prev
    );
    setLoading(false);
  };

  // Calculate stats
  const pendingWithdrawals = withdrawals.filter((w) => w.status === "pending");
  const pendingAmount = pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0);
  const totalProcessed = withdrawals
    .filter((w) => w.status === "completed")
    .reduce((sum, w) => sum + w.amount, 0);

  const statusCounts: Record<string, number> = {
    all: withdrawals.length,
    pending: pendingWithdrawals.length,
    processing: withdrawals.filter((w) => w.status === "processing").length,
    completed: withdrawals.filter((w) => w.status === "completed").length,
    cancelled: withdrawals.filter((w) => w.status === "cancelled" || w.status === "failed").length,
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Withdrawal Approvals</h1>
          <p className="text-muted-foreground">Review and approve withdrawal requests</p>
        </div>
        <Button variant="outline">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export
        </Button>
      </div>

      {/* Alert Banner */}
      {pendingWithdrawals.length > 0 && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-medium">{pendingWithdrawals.length} withdrawals pending approval</p>
              <p className="text-sm text-muted-foreground">
                Total amount: ${pendingAmount.toLocaleString()}
              </p>
            </div>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => setStatusFilter("pending")}
          >
            Review Now
          </Button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.pending}</div>
            <p className="text-xs text-muted-foreground">
              ${pendingAmount.toLocaleString()} total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Processing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.processing}</div>
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed Today</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.completed}</div>
            <p className="text-xs text-muted-foreground">
              ${totalProcessed.toLocaleString()} total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rejected</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.cancelled}</div>
            <p className="text-xs text-muted-foreground">This period</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by ID, user, or destination..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Status Filter */}
              <div className="flex items-center gap-1 border rounded-lg p-1">
                {Object.entries(statusCounts).map(([status, count]) => (
                  <Button
                    key={status}
                    variant={statusFilter === status ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setStatusFilter(status)}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)} ({count})
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {/* Method Filter */}
            <div className="flex items-center gap-1 border rounded-lg p-1">
              {["all", "bank_transfer", "wire", "crypto"].map((method) => (
                <Button
                  key={method}
                  variant={methodFilter === method ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setMethodFilter(method)}
                >
                  {method === "all" ? "All" : method === "bank_transfer" ? "Bank" : method.charAt(0).toUpperCase() + method.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Withdrawals List */}
        <div className={selectedWithdrawal ? "lg:col-span-2" : "lg:col-span-3"}>
          <Card>
            <CardHeader>
              <CardTitle>Withdrawals ({filteredWithdrawals.length})</CardTitle>
              <CardDescription>
                Click on a withdrawal to view details or take action
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredWithdrawals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No withdrawals found matching your criteria</p>
                </div>
              ) : (
                <WithdrawalsTable
                  withdrawals={filteredWithdrawals}
                  onSelectWithdrawal={setSelectedWithdrawal}
                  selectedWithdrawalId={selectedWithdrawal?._id}
                  onApprove={handleApprove}
                  onReject={(id) => {
                    setSelectedWithdrawal(withdrawals.find((w) => w._id === id) || null);
                  }}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Withdrawal Details Panel */}
        {selectedWithdrawal && (
          <div className="lg:col-span-1">
            <WithdrawalDetailsPanel
              withdrawal={selectedWithdrawal}
              onClose={() => setSelectedWithdrawal(null)}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {filteredWithdrawals.length} of {withdrawals.length} withdrawals
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
