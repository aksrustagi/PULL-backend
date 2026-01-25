"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pull/ui";
import { Badge } from "@pull/ui";
import { Button } from "@pull/ui";

// ============================================================================
// Types
// ============================================================================

interface DashboardStats {
  users: {
    total: number;
    active: number;
    suspended: number;
    newToday: number;
    newWeek: number;
    newMonth: number;
  };
  kyc: {
    pending: number;
    approved: number;
    rejected: number;
  };
  orders: {
    total: number;
    today: number;
    week: number;
    filled: number;
    pending: number;
  };
  volume: {
    total: number;
    today: number;
    week: number;
    month: number;
  };
  deposits: {
    total: number;
    pending: number;
  };
  withdrawals: {
    total: number;
    pending: number;
  };
  rwa: {
    total: number;
    listed: number;
    pendingVerification: number;
  };
}

interface AlertItem {
  id: string;
  type: "warning" | "error" | "info";
  title: string;
  description: string;
  link?: string;
  count?: number;
}

// ============================================================================
// Placeholder Data
// ============================================================================

const defaultStats: DashboardStats = {
  users: { total: 12458, active: 11200, suspended: 45, newToday: 127, newWeek: 847, newMonth: 3200 },
  kyc: { pending: 234, approved: 10500, rejected: 125 },
  orders: { total: 45678, today: 1234, week: 8900, filled: 42000, pending: 567 },
  volume: { total: 125000000, today: 2400000, week: 15400000, month: 48000000 },
  deposits: { total: 85000000, pending: 12 },
  withdrawals: { total: 45000000, pending: 23 },
  rwa: { total: 156, listed: 142, pendingVerification: 8 },
};

const recentActivity = [
  { id: "1", action: "User suspended", user: "john@example.com", time: "2 min ago", type: "warning" as const },
  { id: "2", action: "KYC approved", user: "jane@example.com", time: "5 min ago", type: "success" as const },
  { id: "3", action: "Large withdrawal", user: "trader@example.com", time: "12 min ago", type: "info" as const },
  { id: "4", action: "Fraud flag created", user: "suspicious@example.com", time: "18 min ago", type: "error" as const },
  { id: "5", action: "New user signup", user: "newuser@example.com", time: "25 min ago", type: "success" as const },
];

// ============================================================================
// Components
// ============================================================================

function StatCard({
  title,
  value,
  subValue,
  change,
  changeType,
  icon,
}: {
  title: string;
  value: string | number;
  subValue?: string;
  change?: number;
  changeType?: "positive" | "negative" | "neutral";
  icon: React.ReactNode;
}) {
  const formatValue = (val: string | number) => {
    if (typeof val === "number") {
      if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
      if (val >= 1000) return val.toLocaleString();
      return val.toString();
    }
    return val;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="h-8 w-8 text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatValue(value)}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {change !== undefined && (
            <span
              className={
                changeType === "positive"
                  ? "text-green-500"
                  : changeType === "negative"
                  ? "text-red-500"
                  : ""
              }
            >
              {change > 0 ? "+" : ""}
              {change}%
            </span>
          )}
          {subValue && <span>{subValue}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function AlertCard({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
          <CardDescription>No active alerts</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">All systems operational</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alerts</CardTitle>
        <CardDescription>{alerts.length} items need attention</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`flex items-start gap-3 p-3 rounded-lg border ${
              alert.type === "error"
                ? "border-red-500/50 bg-red-500/10"
                : alert.type === "warning"
                ? "border-yellow-500/50 bg-yellow-500/10"
                : "border-blue-500/50 bg-blue-500/10"
            }`}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{alert.title}</span>
                {alert.count && (
                  <Badge variant="secondary" className="text-xs">
                    {alert.count}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{alert.description}</p>
            </div>
            {alert.link && (
              <Link href={alert.link}>
                <Button variant="ghost" size="sm">
                  View
                </Button>
              </Link>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ActivityFeed({ activities }: { activities: typeof recentActivity }) {
  const getTypeColor = (type: string) => {
    switch (type) {
      case "success":
        return "bg-green-500";
      case "warning":
        return "bg-yellow-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-blue-500";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Latest admin actions and system events</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-2 ${getTypeColor(activity.type)}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{activity.action}</p>
                <p className="text-xs text-muted-foreground truncate">{activity.user}</p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{activity.time}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t">
          <Link href="/admin/analytics">
            <Button variant="ghost" size="sm" className="w-full">
              View All Activity
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickActions() {
  const actions = [
    { label: "Review KYC", href: "/admin/users?filter=kyc_pending", icon: "ID" },
    { label: "Approve Withdrawals", href: "/admin/withdrawals?status=pending", icon: "$" },
    { label: "Review Fraud Flags", href: "/admin/fraud?status=pending", icon: "!" },
    { label: "View Orders", href: "/admin/orders", icon: "#" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Common admin tasks</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => (
            <Link key={action.href} href={action.href}>
              <Button variant="outline" className="w-full justify-start gap-2">
                <span className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-xs font-bold">
                  {action.icon}
                </span>
                <span className="text-sm">{action.label}</span>
              </Button>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceHealth() {
  const services = [
    { name: "Database", status: "healthy" as const, latency: 12 },
    { name: "Trading API", status: "healthy" as const, latency: 45 },
    { name: "KYC Provider", status: "healthy" as const, latency: 120 },
    { name: "Payment Gateway", status: "degraded" as const, latency: 350 },
    { name: "Email Service", status: "healthy" as const, latency: 80 },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-green-500";
      case "degraded":
        return "bg-yellow-500";
      case "down":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Service Health</CardTitle>
        <CardDescription>External service status</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {services.map((service) => (
            <div key={service.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(service.status)}`} />
                <span className="text-sm">{service.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">{service.latency}ms</span>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t">
          <Link href="/admin/settings">
            <Button variant="ghost" size="sm" className="w-full">
              View All Services
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In production, fetch from API
    // const fetchStats = async () => {
    //   const response = await fetch('/api/admin/stats');
    //   const data = await response.json();
    //   setStats(data.data);
    //   setLoading(false);
    // };
    // fetchStats();

    // Simulate loading
    setTimeout(() => setLoading(false), 500);
  }, []);

  // Generate alerts based on stats
  const alerts: AlertItem[] = [];
  if (stats.kyc.pending > 100) {
    alerts.push({
      id: "kyc",
      type: "warning",
      title: "KYC Backlog",
      description: "Large number of pending KYC reviews",
      count: stats.kyc.pending,
      link: "/admin/users?filter=kyc_pending",
    });
  }
  if (stats.withdrawals.pending > 10) {
    alerts.push({
      id: "withdrawals",
      type: "warning",
      title: "Pending Withdrawals",
      description: "Withdrawals awaiting approval",
      count: stats.withdrawals.pending,
      link: "/admin/withdrawals?status=pending",
    });
  }
  if (stats.users.suspended > 20) {
    alerts.push({
      id: "suspended",
      type: "info",
      title: "Suspended Users",
      description: "Users with suspended accounts",
      count: stats.users.suspended,
      link: "/admin/users?status=suspended",
    });
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Platform overview and quick actions</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-green-500 border-green-500">
            System Operational
          </Badge>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={stats.users.total}
          subValue={`+${stats.users.newToday} today`}
          change={5.2}
          changeType="positive"
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
        <StatCard
          title="Trading Volume"
          value={stats.volume.today}
          subValue="Last 24 hours"
          change={12.5}
          changeType="positive"
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
        <StatCard
          title="Pending Withdrawals"
          value={stats.withdrawals.pending}
          subValue="Awaiting approval"
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
        <StatCard
          title="Pending KYC"
          value={stats.kyc.pending}
          subValue="Reviews needed"
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
            </svg>
          }
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Users"
          value={stats.users.active}
          subValue={`${((stats.users.active / stats.users.total) * 100).toFixed(1)}% of total`}
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Total Deposits"
          value={stats.deposits.total}
          subValue="All time"
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Orders Today"
          value={stats.orders.today}
          subValue={`${stats.orders.pending} pending`}
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <StatCard
          title="RWA Assets"
          value={stats.rwa.listed}
          subValue={`${stats.rwa.pendingVerification} pending verification`}
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Alerts and Quick Actions */}
        <div className="space-y-6">
          <AlertCard alerts={alerts} />
          <QuickActions />
        </div>

        {/* Middle Column - Activity Feed */}
        <div>
          <ActivityFeed activities={recentActivity} />
        </div>

        {/* Right Column - Service Health */}
        <div>
          <ServiceHealth />
        </div>
      </div>

      {/* Bottom Section - Charts placeholder */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>User Signups</CardTitle>
            <CardDescription>New users over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              <Link href="/admin/analytics">
                <Button variant="outline">
                  View Detailed Analytics
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Trading Volume</CardTitle>
            <CardDescription>Volume trends over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              <Link href="/admin/analytics">
                <Button variant="outline">
                  View Detailed Analytics
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
