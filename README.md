# PULL Super App - Backend

A unified platform competing with Robinhood, Coinbase, Kalshi, and Polymarket, combining trading, messaging, and rewards.

## Product Overview

PULL is a super app that integrates:

- **Matrix Messaging** — Federated, encrypted messaging with bridges to Discord, Telegram, Slack
- **Fantasy Sports** — Daily/weekly contests with real money prizes
- **RWA Trading** — Real World Assets, starting with Pokemon cards (CollectorCrypt integration)
- **Prediction Markets** — Event contracts on sports, politics, entertainment
- **Email Intelligence** — Superhuman-style email client with AI triage
- **Sweepstakes & Rewards** — Points system, prize marketplace, gamification
- **$PULL Token** — Native utility token on Polygon

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                         │
│  [Web App - Next.js]  [iOS - Expo]  [Android - Expo]  [Desktop - Tauri]    │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │
┌─────────────────────────────────────────┼───────────────────────────────────┐
│                            API GATEWAY (Hono + tRPC)                         │
│  [Auth] [Trading] [Predictions] [RWA] [Email] [Rewards] [Matrix] [Webhooks] │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │
┌─────────────────────────────────────────┼───────────────────────────────────┐
│                          ORCHESTRATION LAYER                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Temporal.io Workflows                             │   │
│  │  [KYC/Onboarding] [Order Execution] [Settlement] [Rewards]          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Inngest Background Jobs                           │   │
│  │  [Email Sync] [Notifications] [Analytics] [Webhooks]                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │
┌─────────────────────────────────────────┼───────────────────────────────────┐
│                            DATA LAYER                                        │
│  [Convex - Primary DB + AI Agents] [Upstash Redis] [Typesense Search]       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Category | Technology |
|----------|------------|
| Runtime | Bun |
| API Framework | Hono |
| Type-safe APIs | tRPC + Zod |
| Database | Convex (real-time, serverless) |
| Workflows | Temporal.io |
| Background Jobs | Inngest |
| Cache | Upstash Redis |
| Search | Typesense |
| Blockchain | Polygon + Solidity |
| AI | Claude API (Anthropic) |

## Project Structure

```
packages/
├── api/              # Hono API server with tRPC
│   └── src/
│       ├── routes/   # REST endpoints
│       ├── trpc/     # tRPC router
│       └── middleware/
├── core/             # Business logic & workflows
│   └── src/
│       ├── workflows/  # Temporal workflows
│       │   ├── kyc/
│       │   ├── trading/
│       │   └── rewards/
│       └── services/   # External API clients
├── contracts/        # Solidity smart contracts
│   └── src/
│       ├── PullToken.sol
│       └── PullRewardsNFT.sol
└── shared/           # Shared types & utilities

convex/               # Convex backend
├── schema.ts         # Database schema
├── functions/        # Queries & mutations
└── agents/           # AI agents

apps/
├── web/              # Next.js web app
└── mobile/           # Expo mobile app
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [pnpm](https://pnpm.io) >= 8.0
- [Temporal CLI](https://temporal.io) (for local development)
- Node.js >= 20

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start Convex development server
pnpm db:dev

# Start Temporal (in separate terminal)
temporal server start-dev

# Start API server
pnpm api:dev
```

### Environment Variables

See `.env.example` for all required environment variables. Key services:

- **Convex** - Primary database
- **Temporal** - Workflow orchestration
- **Massive API** - Order execution
- **Dome API** - Market intelligence
- **Persona** - Identity verification
- **Checkr** - Background checks
- **Nylas** - Email sync
- **Anthropic** - AI agents

## Key Features

### KYC Workflow (Temporal)

Durable, long-running workflow for user onboarding:

1. Email verification
2. Persona identity verification
3. Checkr background check
4. Chainalysis wallet screening
5. Agreement signing
6. Account activation

```typescript
const handle = await temporal.workflow.start('AccountCreationWorkflow', {
  taskQueue: 'onboarding',
  args: [{ email, referralCode, walletAddress }],
});
```

### Trading Workflow (Temporal)

Order execution with automatic retries and cancellation support:

```typescript
const handle = await temporal.workflow.start('OrderExecutionWorkflow', {
  taskQueue: 'trading',
  args: [{
    userId,
    assetType: 'prediction',
    assetId: 'event-123-yes',
    side: 'buy',
    quantity: 100,
  }],
});
```

### AI Trading Agent

Claude-powered trading assistant:

```typescript
const result = await convex.action(api.agents.trading.analyzeTradingOpportunity, {
  userId,
  query: "Should I buy YES on the Super Bowl prediction?",
});
```

### $PULL Token

ERC-20 utility token with:
- Staking with rewards
- Vesting schedules
- Points-to-token conversion bridge

## API Endpoints

### Authentication
- `POST /auth/register` - Start registration
- `POST /auth/verify` - Verify email
- `POST /auth/login` - Request login code
- `POST /auth/login/verify` - Complete login

### Trading
- `POST /api/trading/orders` - Create order
- `GET /api/trading/orders/:id` - Get order status
- `DELETE /api/trading/orders/:id` - Cancel order
- `GET /api/trading/portfolio` - Get portfolio

### Predictions
- `GET /api/predictions/events` - List events
- `GET /api/predictions/events/:id` - Get event details
- `GET /api/predictions/positions` - Get user positions

### Rewards
- `GET /api/rewards/status` - Get points status
- `POST /api/rewards/redeem` - Redeem points
- `GET /api/rewards/leaderboard` - Get leaderboard

## Smart Contracts

Deploy to Polygon:

```bash
# Testnet
pnpm contracts:deploy:testnet

# Mainnet
pnpm contracts:deploy:mainnet
```

### PullToken.sol
- ERC-20 with permit
- Staking with rewards
- Vesting schedules
- Points conversion bridge

### PullRewardsNFT.sol
- ERC-1155 for achievements
- Non-transferable badges
- Achievement tracking

## Development

### Running Tests

```bash
pnpm test
```

### Type Checking

```bash
pnpm typecheck
```

### Building

```bash
pnpm build
```

## License

Proprietary - All rights reserved
