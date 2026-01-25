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

interface Order {
  _id: string;
  userId: string;
  userEmail?: string;
  userDisplayName?: string;
  clientOrderId?: string;
  externalOrderId?: string;
  assetClass: "crypto" | "prediction" | "rwa";
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  status: "pending" | "submitted" | "accepted" | "partial_fill" | "filled" | "cancelled" | "rejected" | "expired";
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  price?: number;
  stopPrice?: number;
  averageFilledPrice?: number;
  timeInForce: "day" | "gtc" | "ioc" | "fok";
  fees: number;
  feeCurrency: string;
  createdAt: number;
  updatedAt: number;
  submittedAt?: number;
  filledAt?: number;
  cancelledAt?: number;
}

// ============================================================================
// Placeholder Data
// ============================================================================

const sampleOrders: Order[] = [
  {
    _id: "order1",
    userId: "user1",
    userEmail: "john@example.com",
    userDisplayName: "John Doe",
    externalOrderId: "EXT-001",
    assetClass: "crypto",
    symbol: "BTC-USD",
    side: "buy",
    type: "limit",
    status: "filled",
    quantity: 0.5,
    filledQuantity: 0.5,
    remainingQuantity: 0,
    price: 45000,
    averageFilledPrice: 44950,
    timeInForce: "gtc",
    fees: 22.50,
    feeCurrency: "USD",
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3500000,
    submittedAt: Date.now() - 3590000,
    filledAt: Date.now() - 3500000,
  },
  {
    _id: "order2",
    userId: "user2",
    userEmail: "jane@example.com",
    userDisplayName: "Jane Smith",
    assetClass: "prediction",
    symbol: "BITCOIN-50K-JAN",
    side: "buy",
    type: "market",
    status: "pending",
    quantity: 100,
    filledQuantity: 0,
    remainingQuantity: 100,
    price: 0.65,
    timeInForce: "ioc",
    fees: 0,
    feeCurrency: "USD",
    createdAt: Date.now() - 1800000,
    updatedAt: Date.now() - 1800000,
  },
  {
    _id: "order3",
    userId: "user3",
    userEmail: "whale@example.com",
    userDisplayName: "Whale Trader",
    externalOrderId: "EXT-003",
    assetClass: "crypto",
    symbol: "ETH-USD",
    side: "sell",
    type: "limit",
    status: "partial_fill",
    quantity: 10,
    filledQuantity: 6,
    remainingQuantity: 4,
    price: 2800,
    averageFilledPrice: 2805,
    timeInForce: "gtc",
    fees: 16.83,
    feeCurrency: "USD",
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now() - 600000,
    submittedAt: Date.now() - 7190000,
  },
  {
    _id: "order4",
    userId: "user4",
    userEmail: "newuser@example.com",
    userDisplayName: "New User",
    assetClass: "rwa",
    symbol: "PROP-NYC-001",
    side: "buy",
    type: "market",
    status: "rejected",
    quantity: 5,
    filledQuantity: 0,
    remainingQuantity: 5,
    timeInForce: "day",
    fees: 0,
    feeCurrency: "USD",
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86300000,
  },
  {
    _id: "order5",
    userId: "user1",
    userEmail: "john@example.com",
    userDisplayName: "John Doe",
    assetClass: "crypto",
    symbol: "SOL-USD",
    side: "buy",
    type: "stop_limit",
    status: "accepted",
    quantity: 50,
    filledQuantity: 0,
    remainingQuantity: 50,
    price: 95,
    stopPrice: 90,
    timeInForce: "gtc",
    fees: 0,
    feeCurrency: "USD",
    createdAt: Date.now() - 14400000,
    updatedAt: Date.now() - 14400000,
    submittedAt: Date.now() - 14390000,
  },
  {
    _id: "order6",
    userId: "user5",
    userEmail: "trader@example.com",
    userDisplayName: "Pro Trader",
    assetClass: "prediction",
    symbol: "FED-RATE-CUT-MAR",
    side: "sell",
    type: "limit",
    status: "cancelled",
    quantity: 500,
    filledQuantity: 0,
    remainingQuantity: 500,
    price: 0.42,
    timeInForce: "gtc",
    fees: 0,
    feeCurrency: "USD",
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 86400000,
    cancelledAt: Date.now() - 86400000,
  },
];

// ============================================================================
// Components
// ============================================================================

function OrderStatusBadge({ status }: { status: Order["status"] }) {
  const config: Record<Order["status"], { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    pending: { variant: "secondary", label: "Pending" },
    submitted: { variant: "secondary", label: "Submitted" },
    accepted: { variant: "default", label: "Accepted" },
    partial_fill: { variant: "default", label: "Partial Fill" },
    filled: { variant: "default", label: "Filled" },
    cancelled: { variant: "outline", label: "Cancelled" },
    rejected: { variant: "destructive", label: "Rejected" },
    expired: { variant: "outline", label: "Expired" },
  };

  const { variant, label } = config[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function AssetClassBadge({ assetClass }: { assetClass: Order["assetClass"] }) {
  const config: Record<Order["assetClass"], string> = {
    crypto: "bg-orange-500/10 text-orange-500 border-orange-500/50",
    prediction: "bg-purple-500/10 text-purple-500 border-purple-500/50",
    rwa: "bg-blue-500/10 text-blue-500 border-blue-500/50",
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs border uppercase ${config[assetClass]}`}>
      {assetClass}
    </span>
  );
}

function SideBadge({ side }: { side: Order["side"] }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${
        side === "buy"
          ? "bg-green-500/10 text-green-500"
          : "bg-red-500/10 text-red-500"
      }`}
    >
      {side.toUpperCase()}
    </span>
  );
}

function OrdersTable({
  orders,
  onSelectOrder,
  selectedOrderId,
}: {
  orders: Order[];
  onSelectOrder: (order: Order) => void;
  selectedOrderId?: string;
}) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-4">Order</th>
            <th className="text-left py-3 px-4">User</th>
            <th className="text-left py-3 px-4">Symbol</th>
            <th className="text-left py-3 px-4">Side</th>
            <th className="text-left py-3 px-4">Type</th>
            <th className="text-right py-3 px-4">Qty</th>
            <th className="text-right py-3 px-4">Price</th>
            <th className="text-left py-3 px-4">Status</th>
            <th className="text-left py-3 px-4">Created</th>
            <th className="text-right py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr
              key={order._id}
              className={`border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                selectedOrderId === order._id ? "bg-muted" : ""
              }`}
              onClick={() => onSelectOrder(order)}
            >
              <td className="py-3 px-4">
                <div>
                  <p className="font-mono text-xs">{order._id.slice(0, 8)}...</p>
                  <AssetClassBadge assetClass={order.assetClass} />
                </div>
              </td>
              <td className="py-3 px-4">
                <div>
                  <p className="font-medium text-xs">{order.userDisplayName || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{order.userEmail}</p>
                </div>
              </td>
              <td className="py-3 px-4 font-medium">{order.symbol}</td>
              <td className="py-3 px-4">
                <SideBadge side={order.side} />
              </td>
              <td className="py-3 px-4 capitalize">{order.type.replace("_", " ")}</td>
              <td className="py-3 px-4 text-right font-mono">
                <div>
                  <p>{order.filledQuantity}/{order.quantity}</p>
                  {order.remainingQuantity > 0 && order.status !== "pending" && (
                    <p className="text-xs text-muted-foreground">
                      {order.remainingQuantity} remaining
                    </p>
                  )}
                </div>
              </td>
              <td className="py-3 px-4 text-right font-mono">
                {order.price ? formatCurrency(order.price) : "-"}
              </td>
              <td className="py-3 px-4">
                <OrderStatusBadge status={order.status} />
              </td>
              <td className="py-3 px-4 text-muted-foreground text-xs">
                {new Date(order.createdAt).toLocaleString()}
              </td>
              <td className="py-3 px-4 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectOrder(order);
                  }}
                >
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

function OrderDetailsPanel({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
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
            <span>{order.symbol}</span>
            <SideBadge side={order.side} />
          </CardTitle>
          <CardDescription>Order ID: {order._id}</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <span className="text-sm font-medium">Status</span>
          <OrderStatusBadge status={order.status} />
        </div>

        {/* Order Details */}
        <div className="space-y-4">
          <h4 className="font-medium">Order Details</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="text-muted-foreground">Asset Class</label>
              <p className="font-medium capitalize">{order.assetClass}</p>
            </div>
            <div>
              <label className="text-muted-foreground">Order Type</label>
              <p className="font-medium capitalize">{order.type.replace("_", " ")}</p>
            </div>
            <div>
              <label className="text-muted-foreground">Time in Force</label>
              <p className="font-medium uppercase">{order.timeInForce}</p>
            </div>
            <div>
              <label className="text-muted-foreground">External ID</label>
              <p className="font-mono text-xs">{order.externalOrderId || "-"}</p>
            </div>
          </div>
        </div>

        {/* Quantity & Price */}
        <div className="space-y-4">
          <h4 className="font-medium">Quantity & Price</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="text-muted-foreground">Quantity</label>
              <p className="font-medium font-mono">{order.quantity}</p>
            </div>
            <div>
              <label className="text-muted-foreground">Filled</label>
              <p className="font-medium font-mono">{order.filledQuantity}</p>
            </div>
            {order.price && (
              <div>
                <label className="text-muted-foreground">Limit Price</label>
                <p className="font-medium">{formatCurrency(order.price)}</p>
              </div>
            )}
            {order.stopPrice && (
              <div>
                <label className="text-muted-foreground">Stop Price</label>
                <p className="font-medium">{formatCurrency(order.stopPrice)}</p>
              </div>
            )}
            {order.averageFilledPrice && (
              <div>
                <label className="text-muted-foreground">Avg Fill Price</label>
                <p className="font-medium">{formatCurrency(order.averageFilledPrice)}</p>
              </div>
            )}
            <div>
              <label className="text-muted-foreground">Fees</label>
              <p className="font-medium">
                {formatCurrency(order.fees)} {order.feeCurrency}
              </p>
            </div>
          </div>
        </div>

        {/* User Info */}
        <div className="space-y-4">
          <h4 className="font-medium">User</h4>
          <div className="p-4 bg-muted rounded-lg">
            <p className="font-medium">{order.userDisplayName || "Unknown"}</p>
            <p className="text-sm text-muted-foreground">{order.userEmail}</p>
            <p className="text-xs text-muted-foreground mt-1">ID: {order.userId}</p>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-4">
          <h4 className="font-medium">Timeline</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{formatDate(order.createdAt)}</span>
            </div>
            {order.submittedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Submitted</span>
                <span>{formatDate(order.submittedAt)}</span>
              </div>
            )}
            {order.filledAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Filled</span>
                <span>{formatDate(order.filledAt)}</span>
              </div>
            )}
            {order.cancelledAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cancelled</span>
                <span>{formatDate(order.cancelledAt)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Updated</span>
              <span>{formatDate(order.updatedAt)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function OrdersManagementPage() {
  const searchParams = useSearchParams();

  const [orders, setOrders] = useState<Order[]>(sampleOrders);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>(sampleOrders);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assetClassFilter, setAssetClassFilter] = useState<string>("all");
  const [sideFilter, setSideFilter] = useState<string>("all");

  // Handle URL params
  useEffect(() => {
    const status = searchParams.get("status");
    const assetClass = searchParams.get("assetClass");

    if (status) setStatusFilter(status);
    if (assetClass) setAssetClassFilter(assetClass);
  }, [searchParams]);

  // Filter orders
  useEffect(() => {
    let filtered = orders;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.symbol.toLowerCase().includes(query) ||
          o._id.toLowerCase().includes(query) ||
          o.userEmail?.toLowerCase().includes(query) ||
          o.userDisplayName?.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((o) => o.status === statusFilter);
    }

    if (assetClassFilter !== "all") {
      filtered = filtered.filter((o) => o.assetClass === assetClassFilter);
    }

    if (sideFilter !== "all") {
      filtered = filtered.filter((o) => o.side === sideFilter);
    }

    setFilteredOrders(filtered);
  }, [orders, searchQuery, statusFilter, assetClassFilter, sideFilter]);

  // Calculate stats
  const totalVolume = orders.reduce((sum, o) => {
    if (o.status === "filled" || o.status === "partial_fill") {
      return sum + (o.averageFilledPrice || o.price || 0) * o.filledQuantity;
    }
    return sum;
  }, 0);

  const totalFees = orders.reduce((sum, o) => sum + o.fees, 0);

  const statusCounts: Record<string, number> = {
    all: orders.length,
    pending: orders.filter((o) => o.status === "pending" || o.status === "submitted").length,
    active: orders.filter((o) => o.status === "accepted" || o.status === "partial_fill").length,
    filled: orders.filter((o) => o.status === "filled").length,
    cancelled: orders.filter((o) => o.status === "cancelled" || o.status === "rejected" || o.status === "expired").length,
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Order Management</h1>
          <p className="text-muted-foreground">Monitor and manage all trading orders</p>
        </div>
        <Button variant="outline">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Orders
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Orders</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length}</div>
            <p className="text-xs text-muted-foreground">
              {statusCounts.active} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Fill Rate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((statusCounts.filled / (orders.length || 1)) * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {statusCounts.filled} filled orders
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Volume</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(totalVolume / 1000).toFixed(1)}K
            </div>
            <p className="text-xs text-muted-foreground">From filled orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Fees</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalFees.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Collected fees</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by symbol, order ID, or user..."
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
            {/* Asset Class Filter */}
            <div className="flex items-center gap-1 border rounded-lg p-1">
              {["all", "crypto", "prediction", "rwa"].map((assetClass) => (
                <Button
                  key={assetClass}
                  variant={assetClassFilter === assetClass ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setAssetClassFilter(assetClass)}
                >
                  {assetClass.charAt(0).toUpperCase() + assetClass.slice(1)}
                </Button>
              ))}
            </div>
            {/* Side Filter */}
            <div className="flex items-center gap-1 border rounded-lg p-1">
              {["all", "buy", "sell"].map((side) => (
                <Button
                  key={side}
                  variant={sideFilter === side ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSideFilter(side)}
                >
                  {side.charAt(0).toUpperCase() + side.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Orders List */}
        <div className={selectedOrder ? "lg:col-span-2" : "lg:col-span-3"}>
          <Card>
            <CardHeader>
              <CardTitle>Orders ({filteredOrders.length})</CardTitle>
              <CardDescription>
                Click on an order to view details
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No orders found matching your criteria</p>
                </div>
              ) : (
                <OrdersTable
                  orders={filteredOrders}
                  onSelectOrder={setSelectedOrder}
                  selectedOrderId={selectedOrder?._id}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Order Details Panel */}
        {selectedOrder && (
          <div className="lg:col-span-1">
            <OrderDetailsPanel
              order={selectedOrder}
              onClose={() => setSelectedOrder(null)}
            />
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {filteredOrders.length} of {orders.length} orders
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
