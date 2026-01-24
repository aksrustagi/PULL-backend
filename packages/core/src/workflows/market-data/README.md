# Market Data Real-Time Architecture

## 🎯 Overview

This module replaces custom WebSocket infrastructure with a simpler architecture using **Convex real-time subscriptions**.

## 🏗️ Architecture

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Kalshi    │ ──WS──> │   Temporal   │ ──────> │   Convex    │
│  WebSocket  │         │    Worker    │ Mutate  │  Database   │
└─────────────┘         └──────────────┘         └─────────────┘
                                                         │
                                                         │ Real-time
                                                         │ Subscribe
                                                         ↓
                                                  ┌─────────────┐
                                                  │   React     │
                                                  │  Frontend   │
                                                  └─────────────┘
```

### Components:

1. **Temporal Worker** (`kalshi-stream.workflow.ts`)
   - Long-running workflow maintains Kalshi WebSocket connection
   - Receives market data updates from Kalshi
   - Calls Temporal activities to update Convex

2. **Temporal Activities** (`activities.ts`)
   - Update market prices in Convex
   - Update orderbooks in Convex
   - Insert trades in Convex
   - Cleanup old data

3. **Convex Mutations** (`packages/db/convex/marketData.ts`)
   - Persist market data to database
   - Trigger real-time updates to subscribed clients

4. **React Hooks** (built into Convex)
   - Clients use `useQuery()` for auto-updating data
   - No custom WebSocket code needed!

## 💡 Why This is Better

### ❌ Before (Custom WebSocket)

```typescript
// Complex custom infrastructure needed:
- Custom WebSocket server (Hono + Durable Objects)
- Custom message protocol (subscribe/unsubscribe/ping/pong)
- Custom event emitter
- Custom connection manager
- Custom React hooks
- Custom reconnection logic
- Manual state synchronization
```

### ✅ After (Convex Real-Time)

```typescript
// Simple Convex subscription:
const price = useQuery(api.marketData.getPrice, { ticker: "BTC-USD" });

// That's it! Auto-updates when data changes in Convex
// No WebSocket code needed on frontend
```

## 📝 Usage Examples

### Frontend: Subscribe to Real-Time Price

```typescript
import { useQuery } from "convex/react";
import { api } from "@pull/db/convex/_generated/api";

function PriceDisplay({ ticker }: { ticker: string }) {
  // Automatically updates when price changes!
  const price = useQuery(api.marketData.getPrice, { ticker });

  if (!price) return <div>Loading...</div>;

  return (
    <div>
      <span>{ticker}: ${price.price}</span>
      <span className={price.changePercent24h > 0 ? "green" : "red"}>
        {price.changePercent24h > 0 ? "+" : ""}
        {price.changePercent24h.toFixed(2)}%
      </span>
    </div>
  );
}
```

### Frontend: Subscribe to Real-Time Orderbook

```typescript
function Orderbook({ ticker }: { ticker: string }) {
  const orderbook = useQuery(api.marketData.getOrderbook, { ticker, depth: 10 });

  if (!orderbook) return <div>Loading orderbook...</div>;

  return (
    <div>
      <h3>Bids</h3>
      {orderbook.bids.map(([price, size]) => (
        <div key={price}>
          {price.toFixed(2)} - {size}
        </div>
      ))}
      <h3>Asks</h3>
      {orderbook.asks.map(([price, size]) => (
        <div key={price}>
          {price.toFixed(2)} - {size}
        </div>
      ))}
      <div>Spread: {orderbook.spread?.toFixed(4)}</div>
    </div>
  );
}
```

### Frontend: Subscribe to Real-Time Trades

```typescript
function RecentTrades({ ticker }: { ticker: string }) {
  const trades = useQuery(api.marketData.getRecentTrades, { ticker, limit: 20 });

  if (!trades) return <div>Loading trades...</div>;

  return (
    <div>
      {trades.map((trade) => (
        <div key={trade.id}>
          <span className={trade.side === "buy" ? "green" : "red"}>
            {trade.side.toUpperCase()}
          </span>
          <span>{trade.price.toFixed(2)}</span>
          <span>{trade.size}</span>
          <span>{new Date(trade.timestamp).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}
```

### Backend: Start Kalshi Stream Worker

```typescript
import { kalshiStreamWorkflow } from "@pull/core/workflows/market-data";
import { WorkflowClient } from "@temporalio/client";

const client = new WorkflowClient();

await client.start(kalshiStreamWorkflow, {
  taskQueue: "market-data",
  workflowId: "kalshi-stream-production",
  args: [
    {
      markets: ["BTC-USD", "ETH-USD", "ELECTION-2024"],
      apiKey: process.env.KALSHI_API_KEY,
      apiSecret: process.env.KALSHI_API_SECRET,
      enableOrderbook: true,
      enableTrades: true,
      enablePrices: true,
      reconnectDelay: 5,
      healthCheckInterval: 30,
      cleanupInterval: 3600,
    },
  ],
});
```

## 🚀 Benefits

1. **Simpler Frontend**: No custom WebSocket hooks, just use `useQuery()`
2. **Auto-Reconnection**: Convex handles reconnection automatically
3. **Optimistic Updates**: Built-in with Convex mutations
4. **Type Safety**: Full TypeScript support across stack
5. **Offline Support**: Convex caches data automatically
6. **Less Infrastructure**: No need for Durable Objects or custom WebSocket servers
7. **Better Scaling**: Convex handles millions of connections
8. **Easier Testing**: Query functions are easy to test

## 🔄 Migration from Custom WebSocket

If you were using custom WebSocket hooks before:

### Before:
```typescript
const { data } = useWebSocket();
const price = useMarketPrice("BTC-USD");
const orderbook = useOrderbook("BTC-USD");
```

### After:
```typescript
const price = useQuery(api.marketData.getPrice, { ticker: "BTC-USD" });
const orderbook = useQuery(api.marketData.getOrderbook, { ticker: "BTC-USD" });
```

**That's it!** The data updates automatically when it changes in Convex.

## 📊 Data Flow

1. **Kalshi WebSocket** → Sends market data
2. **Temporal Worker** → Receives data via WebSocket
3. **Temporal Activity** → Calls Convex mutation
4. **Convex Mutation** → Updates database
5. **Convex Real-Time** → Pushes update to subscribed clients
6. **React Component** → Re-renders with new data

All of this happens in milliseconds!

## 🛠️ Implementation Status

- ✅ Convex schema for market data
- ✅ Convex mutations and queries
- ✅ Temporal activities
- ⏳ Temporal workflow (placeholder)
- ⏳ Kalshi WebSocket integration (needs production implementation)

## 🔮 Next Steps

1. Implement actual Kalshi WebSocket connection in Temporal activity
2. Add signal handlers for dynamic market subscription
3. Add metrics and monitoring
4. Add error alerting
5. Deploy to production

## 📚 Related

- PR #20: Original custom WebSocket implementation (being replaced by this)
- Convex Docs: https://docs.convex.dev/
- Temporal Docs: https://docs.temporal.io/
