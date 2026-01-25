"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pull/ui";
import { Badge } from "@pull/ui";
import { Button } from "@pull/ui";
import { Input } from "@pull/ui";

// ============================================================================
// Types
// ============================================================================

interface User {
  _id: string;
  email: string;
  emailVerified: boolean;
  phone?: string;
  phoneVerified: boolean;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  firstName?: string;
  lastName?: string;
  country?: string;
  status: "active" | "inactive" | "suspended" | "closed";
  kycStatus: string;
  kycTier: "none" | "basic" | "verified" | "premium" | "institutional";
  authProvider: string;
  walletAddress?: string;
  referralCode: string;
  lastLoginAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface UserDetailsData {
  user: User;
  balances: Array<{ assetType: string; symbol: string; available: number; held: number }>;
  positions: Array<{ symbol: string; quantity: number; unrealizedPnL: number }>;
  orders: Array<{ _id: string; symbol: string; side: string; status: string; quantity: number }>;
  kycRecords: Array<{ type: string; status: string; result?: string }>;
  referralCount: number;
  deposits: Array<{ amount: number; status: string; createdAt: number }>;
  withdrawals: Array<{ amount: number; status: string; createdAt: number }>;
}

// ============================================================================
// Placeholder Data
// ============================================================================

const sampleUsers: User[] = [
  {
    _id: "user1",
    email: "john.doe@example.com",
    emailVerified: true,
    phone: "+1234567890",
    phoneVerified: true,
    username: "johndoe",
    displayName: "John Doe",
    firstName: "John",
    lastName: "Doe",
    country: "US",
    status: "active",
    kycStatus: "approved",
    kycTier: "verified",
    authProvider: "email",
    referralCode: "JOHN123",
    lastLoginAt: Date.now() - 3600000,
    createdAt: Date.now() - 30 * 24 * 3600000,
    updatedAt: Date.now() - 3600000,
  },
  {
    _id: "user2",
    email: "jane.smith@example.com",
    emailVerified: true,
    phoneVerified: false,
    displayName: "Jane Smith",
    firstName: "Jane",
    lastName: "Smith",
    country: "UK",
    status: "active",
    kycStatus: "identity_pending",
    kycTier: "basic",
    authProvider: "google",
    referralCode: "JANE456",
    lastLoginAt: Date.now() - 7200000,
    createdAt: Date.now() - 15 * 24 * 3600000,
    updatedAt: Date.now() - 7200000,
  },
  {
    _id: "user3",
    email: "suspicious@example.com",
    emailVerified: true,
    phoneVerified: false,
    displayName: "Suspicious User",
    status: "suspended",
    kycStatus: "rejected",
    kycTier: "none",
    authProvider: "email",
    referralCode: "SUSP789",
    createdAt: Date.now() - 7 * 24 * 3600000,
    updatedAt: Date.now() - 24 * 3600000,
  },
  {
    _id: "user4",
    email: "whale@example.com",
    emailVerified: true,
    phoneVerified: true,
    displayName: "Whale Trader",
    firstName: "Whale",
    lastName: "Trader",
    country: "SG",
    status: "active",
    kycStatus: "approved",
    kycTier: "institutional",
    authProvider: "wallet",
    walletAddress: "0x1234...abcd",
    referralCode: "WHALE001",
    lastLoginAt: Date.now() - 1800000,
    createdAt: Date.now() - 60 * 24 * 3600000,
    updatedAt: Date.now() - 1800000,
  },
  {
    _id: "user5",
    email: "newuser@example.com",
    emailVerified: false,
    phoneVerified: false,
    displayName: "New User",
    status: "active",
    kycStatus: "pending",
    kycTier: "none",
    authProvider: "email",
    referralCode: "NEW2024",
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3600000,
  },
];

// ============================================================================
// Components
// ============================================================================

function StatusBadge({ status }: { status: User["status"] }) {
  const variants: Record<User["status"], { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    active: { variant: "default", label: "Active" },
    inactive: { variant: "secondary", label: "Inactive" },
    suspended: { variant: "destructive", label: "Suspended" },
    closed: { variant: "outline", label: "Closed" },
  };

  const { variant, label } = variants[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function KYCBadge({ status, tier }: { status: string; tier: string }) {
  const getKYCColor = () => {
    if (status === "approved") return "bg-green-500/10 text-green-500 border-green-500/50";
    if (status === "rejected") return "bg-red-500/10 text-red-500 border-red-500/50";
    if (status.includes("pending")) return "bg-yellow-500/10 text-yellow-500 border-yellow-500/50";
    return "bg-gray-500/10 text-gray-500 border-gray-500/50";
  };

  return (
    <div className="flex items-center gap-2">
      <span className={`px-2 py-0.5 rounded text-xs border ${getKYCColor()}`}>
        {status.replace(/_/g, " ")}
      </span>
      <span className="text-xs text-muted-foreground capitalize">{tier}</span>
    </div>
  );
}

function UserTable({
  users,
  onSelectUser,
  selectedUserId,
}: {
  users: User[];
  onSelectUser: (user: User) => void;
  selectedUserId?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-4">User</th>
            <th className="text-left py-3 px-4">Status</th>
            <th className="text-left py-3 px-4">KYC</th>
            <th className="text-left py-3 px-4">Auth</th>
            <th className="text-left py-3 px-4">Joined</th>
            <th className="text-left py-3 px-4">Last Login</th>
            <th className="text-right py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user._id}
              className={`border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                selectedUserId === user._id ? "bg-muted" : ""
              }`}
              onClick={() => onSelectUser(user)}
            >
              <td className="py-3 px-4">
                <div>
                  <p className="font-medium">{user.displayName || user.email}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </td>
              <td className="py-3 px-4">
                <StatusBadge status={user.status} />
              </td>
              <td className="py-3 px-4">
                <KYCBadge status={user.kycStatus} tier={user.kycTier} />
              </td>
              <td className="py-3 px-4 capitalize">{user.authProvider}</td>
              <td className="py-3 px-4 text-muted-foreground">
                {new Date(user.createdAt).toLocaleDateString()}
              </td>
              <td className="py-3 px-4 text-muted-foreground">
                {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
              </td>
              <td className="py-3 px-4 text-right">
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onSelectUser(user); }}>
                  View
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserDetailsPanel({
  user,
  onClose,
  onSuspend,
  onReactivate,
  onApproveKYC,
  onRejectKYC,
}: {
  user: User;
  onClose: () => void;
  onSuspend: (userId: string, reason: string) => void;
  onReactivate: (userId: string) => void;
  onApproveKYC: (userId: string, tier: string) => void;
  onRejectKYC: (userId: string, reason: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "balances" | "activity" | "kyc">("overview");
  const [suspendReason, setSuspendReason] = useState("");
  const [kycRejectReason, setKycRejectReason] = useState("");
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showKYCModal, setShowKYCModal] = useState(false);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>{user.displayName || user.email}</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b">
          {(["overview", "balances", "activity", "kyc"] as const).map((tab) => (
            <button
              key={tab}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground">Status</label>
                <div className="mt-1">
                  <StatusBadge status={user.status} />
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">KYC Status</label>
                <div className="mt-1">
                  <KYCBadge status={user.kycStatus} tier={user.kycTier} />
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Email Verified</label>
                <p className="font-medium">{user.emailVerified ? "Yes" : "No"}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Phone Verified</label>
                <p className="font-medium">{user.phoneVerified ? "Yes" : "No"}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Auth Provider</label>
                <p className="font-medium capitalize">{user.authProvider}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Country</label>
                <p className="font-medium">{user.country || "Not specified"}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Referral Code</label>
                <p className="font-medium font-mono">{user.referralCode}</p>
              </div>
              {user.walletAddress && (
                <div>
                  <label className="text-sm text-muted-foreground">Wallet</label>
                  <p className="font-medium font-mono text-xs">{user.walletAddress}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-4 border-t space-y-2">
              <h4 className="font-medium">Actions</h4>
              <div className="flex flex-wrap gap-2">
                {user.status === "active" ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowSuspendModal(true)}
                  >
                    Suspend User
                  </Button>
                ) : user.status === "suspended" ? (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => onReactivate(user._id)}
                  >
                    Reactivate User
                  </Button>
                ) : null}

                {user.kycStatus.includes("pending") && (
                  <>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => onApproveKYC(user._id, "verified")}
                    >
                      Approve KYC
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowKYCModal(true)}
                    >
                      Reject KYC
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Suspend Modal */}
            {showSuspendModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-background rounded-lg p-6 max-w-md w-full m-4">
                  <h3 className="font-bold text-lg mb-4">Suspend User</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Please provide a reason for suspending this user.
                  </p>
                  <Input
                    placeholder="Suspension reason"
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    className="mb-4"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowSuspendModal(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        onSuspend(user._id, suspendReason);
                        setShowSuspendModal(false);
                        setSuspendReason("");
                      }}
                      disabled={!suspendReason}
                    >
                      Suspend
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* KYC Reject Modal */}
            {showKYCModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-background rounded-lg p-6 max-w-md w-full m-4">
                  <h3 className="font-bold text-lg mb-4">Reject KYC</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Please provide a reason for rejecting this user&apos;s KYC.
                  </p>
                  <Input
                    placeholder="Rejection reason"
                    value={kycRejectReason}
                    onChange={(e) => setKycRejectReason(e.target.value)}
                    className="mb-4"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowKYCModal(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        onRejectKYC(user._id, kycRejectReason);
                        setShowKYCModal(false);
                        setKycRejectReason("");
                      }}
                      disabled={!kycRejectReason}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Balances Tab */}
        {activeTab === "balances" && (
          <div className="space-y-4">
            <div className="text-center py-8 text-muted-foreground">
              <p>Balance information would be loaded from the API</p>
              <p className="text-sm mt-2">Showing placeholder data</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between p-3 bg-muted rounded-lg">
                <span>USD</span>
                <span className="font-mono">$12,450.00</span>
              </div>
              <div className="flex justify-between p-3 bg-muted rounded-lg">
                <span>BTC</span>
                <span className="font-mono">0.5 BTC</span>
              </div>
              <div className="flex justify-between p-3 bg-muted rounded-lg">
                <span>Points</span>
                <span className="font-mono">15,000 pts</span>
              </div>
            </div>
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === "activity" && (
          <div className="space-y-4">
            <div className="text-center py-8 text-muted-foreground">
              <p>Activity timeline would be loaded from the API</p>
              <p className="text-sm mt-2">Recent orders, trades, and account changes</p>
            </div>
          </div>
        )}

        {/* KYC Tab */}
        {activeTab === "kyc" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <h4 className="font-medium mb-2">Current Status</h4>
                <KYCBadge status={user.kycStatus} tier={user.kycTier} />
              </div>
              <div className="p-4 border rounded-lg">
                <h4 className="font-medium mb-2">Verification Level</h4>
                <p className="capitalize">{user.kycTier}</p>
              </div>
            </div>
            <div className="text-center py-8 text-muted-foreground">
              <p>KYC documents and verification history would be loaded from the API</p>
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

export default function UsersManagementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [users, setUsers] = useState<User[]>(sampleUsers);
  const [filteredUsers, setFilteredUsers] = useState<User[]>(sampleUsers);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [kycFilter, setKycFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  // Handle URL params
  useEffect(() => {
    const status = searchParams.get("status");
    const filter = searchParams.get("filter");

    if (status) setStatusFilter(status);
    if (filter === "kyc_pending") setKycFilter("pending");
  }, [searchParams]);

  // Filter users
  useEffect(() => {
    let filtered = users;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.email.toLowerCase().includes(query) ||
          u.displayName?.toLowerCase().includes(query) ||
          u.username?.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((u) => u.status === statusFilter);
    }

    if (kycFilter !== "all") {
      if (kycFilter === "pending") {
        filtered = filtered.filter((u) => u.kycStatus.includes("pending"));
      } else {
        filtered = filtered.filter((u) => u.kycStatus === kycFilter);
      }
    }

    setFilteredUsers(filtered);
  }, [users, searchQuery, statusFilter, kycFilter]);

  const handleSuspend = async (userId: string, reason: string) => {
    setLoading(true);
    // In production, call API
    console.log("Suspending user:", userId, "Reason:", reason);

    setUsers((prev) =>
      prev.map((u) => (u._id === userId ? { ...u, status: "suspended" as const } : u))
    );
    setSelectedUser((prev) => (prev?._id === userId ? { ...prev, status: "suspended" as const } : prev));
    setLoading(false);
  };

  const handleReactivate = async (userId: string) => {
    setLoading(true);
    // In production, call API
    console.log("Reactivating user:", userId);

    setUsers((prev) =>
      prev.map((u) => (u._id === userId ? { ...u, status: "active" as const } : u))
    );
    setSelectedUser((prev) => (prev?._id === userId ? { ...prev, status: "active" as const } : prev));
    setLoading(false);
  };

  const handleApproveKYC = async (userId: string, tier: string) => {
    setLoading(true);
    // In production, call API
    console.log("Approving KYC for user:", userId, "Tier:", tier);

    setUsers((prev) =>
      prev.map((u) =>
        u._id === userId ? { ...u, kycStatus: "approved", kycTier: tier as User["kycTier"] } : u
      )
    );
    setSelectedUser((prev) =>
      prev?._id === userId ? { ...prev, kycStatus: "approved", kycTier: tier as User["kycTier"] } : prev
    );
    setLoading(false);
  };

  const handleRejectKYC = async (userId: string, reason: string) => {
    setLoading(true);
    // In production, call API
    console.log("Rejecting KYC for user:", userId, "Reason:", reason);

    setUsers((prev) =>
      prev.map((u) => (u._id === userId ? { ...u, kycStatus: "rejected" } : u))
    );
    setSelectedUser((prev) => (prev?._id === userId ? { ...prev, kycStatus: "rejected" } : prev));
    setLoading(false);
  };

  const statusCounts = {
    all: users.length,
    active: users.filter((u) => u.status === "active").length,
    suspended: users.filter((u) => u.status === "suspended").length,
    inactive: users.filter((u) => u.status === "inactive").length,
  };

  const kycCounts = {
    all: users.length,
    pending: users.filter((u) => u.kycStatus.includes("pending")).length,
    approved: users.filter((u) => u.kycStatus === "approved").length,
    rejected: users.filter((u) => u.kycStatus === "rejected").length,
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Search, filter, and manage user accounts</p>
        </div>
        <Button variant="outline">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Users
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by email, name, or username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
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
              <div className="flex items-center gap-1 border rounded-lg p-1">
                {Object.entries(kycCounts).map(([kyc, count]) => (
                  <Button
                    key={kyc}
                    variant={kycFilter === kyc ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setKycFilter(kyc)}
                  >
                    KYC: {kyc.charAt(0).toUpperCase() + kyc.slice(1)} ({count})
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* User List */}
        <div className={selectedUser ? "lg:col-span-2" : "lg:col-span-3"}>
          <Card>
            <CardHeader>
              <CardTitle>Users ({filteredUsers.length})</CardTitle>
              <CardDescription>
                Click on a user to view details and take actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No users found matching your criteria</p>
                </div>
              ) : (
                <UserTable
                  users={filteredUsers}
                  onSelectUser={setSelectedUser}
                  selectedUserId={selectedUser?._id}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* User Details Panel */}
        {selectedUser && (
          <div className="lg:col-span-1">
            <UserDetailsPanel
              user={selectedUser}
              onClose={() => setSelectedUser(null)}
              onSuspend={handleSuspend}
              onReactivate={handleReactivate}
              onApproveKYC={handleApproveKYC}
              onRejectKYC={handleRejectKYC}
            />
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {filteredUsers.length} of {users.length} users
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
