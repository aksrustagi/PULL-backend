# Social Trading System

A comprehensive, production-ready social trading platform with advanced copy trading features comparable to professional platforms like eToro.

## 🎯 Features

### Core Social Features
- ✅ Follow/unfollow traders
- ✅ Trader profiles with verification badges
- ✅ Followers and copiers tracking
- ✅ Activity feeds and notifications
- ✅ Position comments and likes

### Advanced Analytics
- ✅ **Performance Metrics**: Total P&L, Win Rate, Average P&L per trade
- ✅ **Risk Metrics**: Sharpe Ratio, Sortino Ratio, Maximum Drawdown, Volatility
- ✅ **Risk Score**: Calculated from volatility, drawdown, and Sharpe ratio
- ✅ **Diversification Score**: Based on unique symbols traded
- ✅ **Consistency Score**: Coefficient of variation of returns
- ✅ **Streak Tracking**: Current and longest win/loss streaks
- ✅ **Hold Time Analysis**: Average position holding period

### Copy Trading Features
- ✅ **Multiple Sizing Modes**:
  - Fixed Amount: Copy with a fixed dollar amount
  - Portfolio Percentage: Use a percentage of your portfolio
  - Proportional: Scale based on portfolio size ratio
  - Fixed Ratio: Multiply trader's position by a fixed ratio

- ✅ **Risk Controls**:
  - Maximum position size limits
  - Daily loss limits
  - Total exposure limits
  - Configurable stop loss and take profit
  - Asset class filtering
  - Symbol exclusions
  - Copy delay (for analysis before copying)
  - Slippage protection

### Leaderboards
- ✅ Multiple leaderboard types: P&L, Win Rate, Sharpe Ratio, Reputation
- ✅ Multiple periods: Daily, Weekly, Monthly, All-time
- ✅ Rank tracking with historical data
- ✅ Percentile rankings

### Gamification
- ✅ **Trader Tiers**: Bronze → Silver → Gold → Platinum → Diamond → Legend
- ✅ **Badges & Achievements**: Earned based on performance and milestones
- ✅ **Verification System**: Verified trader status with badges
- ✅ **Reputation Scores**: Composite score from 6 metrics (0-1000 scale)

### Fraud Detection
- ✅ **Wash Trading Detection**: Detect self-trading patterns
- ✅ **Front-Running Detection**: Detect if traders front-run copiers
- ✅ **Unusual Volume Alerts**: Flag abnormal trading volumes
- ✅ **Performance Manipulation Detection**: Detect artificial performance inflation

## 📁 Project Structure

```
├── packages/db/convex/
│   ├── schema.ts                    # Database schema (18 tables)
│   └── social/
│       ├── queries.ts               # 30+ query functions
│       └── mutations.ts             # 15+ mutation functions
│
├── apps/workers/src/
│   ├── workflows/social.ts          # 10 Temporal workflows
│   └── activities/social.ts         # Activity implementations
│
├── apps/api/src/
│   ├── services/social.ts           # 6 service classes
│   └── routes/social.ts             # RESTful API endpoints
│
└── packages/ui/src/components/social/
    ├── trader-card.tsx              # Trader info card component
    ├── leaderboard.tsx              # Leaderboard component
    ├── copy-settings-modal.tsx      # Copy trading settings modal
    └── index.tsx                    # Component exports
```

## 🔌 API Endpoints

### Follow/Unfollow
- `POST /social/follow` - Follow a trader
- `DELETE /social/follow/:traderId` - Unfollow a trader
- `PATCH /social/follow/:traderId` - Update follow settings
- `GET /social/followers` - Get followers
- `GET /social/following` - Get following

### Trader Profiles
- `GET /social/traders/:traderId` - Get trader profile
- `PATCH /social/traders/me` - Update my profile
- `GET /social/traders/:traderId/stats` - Get trader stats
- `GET /social/traders/search` - Search traders
- `GET /social/traders/trending` - Get trending traders

### Copy Trading
- `POST /social/copy/subscribe` - Create subscription
- `GET /social/copy/subscriptions` - Get my subscriptions
- `PATCH /social/copy/subscriptions/:id` - Update subscription
- `POST /social/copy/subscriptions/:id/pause` - Pause
- `POST /social/copy/subscriptions/:id/resume` - Resume
- `DELETE /social/copy/subscriptions/:id` - Cancel

### Leaderboards
- `GET /social/leaderboards/:type/:period` - Get leaderboard
- `GET /social/leaderboards/:type/:period/my-rank` - Get my rank

## 🚀 Getting Started

1. **Start Services**:
   ```bash
   pnpm db:dev          # Start Convex
   pnpm dev:workers     # Start Temporal workers
   pnpm dev:api         # Start API server
   pnpm dev:web         # Start web app
   ```

2. **Create a Trader Profile**:
   ```bash
   curl -X PATCH http://localhost:3000/social/traders/me \
     -d '{"isPublic": true, "allowCopyTrading": true}'
   ```

3. **Start Copy Trading**:
   ```bash
   curl -X POST http://localhost:3000/social/copy/subscribe \
     -d '{"traderId": "user_123", "copyMode": "fixed_amount", "fixedAmount": 1000}'
   ```

## 🔒 Security

- ✅ **0 vulnerabilities** detected by CodeQL
- ✅ All inputs validated with Zod schemas
- ✅ Type-safe across all layers
- ✅ Fraud detection system

## 📝 License

Part of the PULL monorepo.

---

Built with ❤️ for the PULL platform
