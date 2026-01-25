# PULL Super App - Backend

A unified platform for prediction markets, crypto trading, real-world assets (RWAs), fantasy sports, messaging, and comprehensive 10x features.

## Core Features

- **Prediction Markets** — Trade on real-world events with YES/NO contracts
- **Crypto Trading** — Buy, sell, and manage crypto portfolio
- **RWA Trading** — Fractional ownership of Pokemon cards and collectibles
- **Fantasy Sports** — NFL, NBA, MLB, Golf, NCAA March Madness
- **Email Intelligence** — AI-powered email triage with smart replies
- **Matrix Messaging** — Federated, encrypted messaging
- **Rewards System** — Points, tiers, and redemption marketplace
- **$PULL Token** — Native utility token on Polygon

## 🚀 10x Feature Enhancements

### Real-Time & Collaboration
- **Presence System** - Live collaboration cursors, typing indicators, user presence tracking
- **WebSocket Integration** - Real-time updates for all sports

### AI & Machine Learning
- **AI Trade Advisor** - Natural language trade analysis, counter-offer generation, collusion detection
- **Injury Prediction** - ML-based injury risk scoring with sport-specific patterns
- **Voice Commands** - Speech-to-text with Whisper API, audio recaps with ElevenLabs

### Computer Vision
- **Screenshot Parser** - Extract trade details from screenshots
- **Jersey Scanner** - Point at jersey to see player stats
- **TV Sync** - Camera recognizes game broadcast with fantasy overlay

### Social & Discovery
- **Social Graph** - Friend-of-friend recommendations, contact import
- **League Discovery** - Public league search with reputation scores
- **League Recommendations** - AI-powered league matching

### Financial Services
- **Virtual PULL Card** - Cashback on purchases (PCI-compliant with Stripe tokenization)
- **Instant Withdrawals** - Bank, PayPal, Venmo, crypto support
- **Tax Documents** - Automated 1099 generation
- **Auto-Invest** - Configure automatic investment of winnings

### Advanced Analytics
- **Playoff Simulator** - Monte Carlo simulations with 10,000+ iterations
- **Bench Analysis** - Season-long points left on bench tracking
- **Optimal Lineup** - Hindsight analysis of lineup decisions
- **Draft Grades** - Re-grade draft based on actual performance
- **Trend Analysis** - Player trending up/down detection

### Engagement & Retention
- **Streak System** - Multipliers for consecutive logins
- **Season Pass** - Free and premium tracks with exclusive rewards
- **Achievements** - Unlockable badges and rewards
- **NFT Trophies** - Mintable championship trophies
- **Year in Review** - Shareable season summaries

### Compliance & Trust
- **Responsible Gaming** - Self-exclusion, deposit limits, session limits, cool-off periods
- **Geofencing** - State-by-state compliance (privacy-focused with IP hashing)
- **Audit Trails** - Complete audit logs for all transactions
- **Odds Transparency** - LMSR calculation explanations

### Multi-Device Support
- **Apple Watch** - Complications with live scores and alerts
- **Wear OS** - Android watch support
- **CarPlay/Android Auto** - Safe audio updates while driving
- **Smart TV Apps** - tvOS, Android TV, Fire TV dashboards
- **Widgets** - iOS/Android home screen widgets

📖 **Full Documentation**: See [`docs/10X_FEATURES.md`](docs/10X_FEATURES.md) for complete details

📚 **API Reference**: See [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) for all 55+ endpoints

## Tech Stack

| Category | Technology |
|----------|------------|
| Monorepo | Turborepo + pnpm |
| Runtime | Bun / Node.js 20+ |
| API | Hono + tRPC |
| Database | Convex (real-time) |
| Workflows | Temporal.io |
| Frontend | Next.js 14 |
| UI | shadcn/ui + Tailwind |
| Blockchain | Polygon + Solidity |
| AI | Claude API (Anthropic) |

## Project Structure

```
apps/
├── web/              # Next.js 14 frontend (App Router)
├── api/              # Hono API server with tRPC
└── workers/          # Temporal workflow workers

packages/
├── config/           # Shared configs (tsconfig, eslint, prettier)
├── types/            # Shared TypeScript types
├── db/               # Convex schema and functions
├── core/             # Shared business logic and services
└── ui/               # Shared React components (shadcn/ui)
```

## Getting Started

### Prerequisites

- Node.js >= 20
- [pnpm](https://pnpm.io) >= 9.0
- [Bun](https://bun.sh) >= 1.0
- Docker (for local development services)

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start local services (Postgres, Redis, Temporal)
pnpm docker:up

# Start Convex development server
pnpm db:dev

# Start all apps in development
pnpm dev
```

### Development Commands

```bash
# Start specific apps
pnpm dev:web      # Next.js frontend
pnpm dev:api      # Hono API server
pnpm dev:workers  # Temporal workers

# Build
pnpm build

# Type checking
pnpm typecheck

# Linting
pnpm lint
pnpm lint:fix

# Format
pnpm format
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                         │
│  [Web App - Next.js]  [iOS - React Native]  [Android - React Native]       │
└─────────────────────────────────────────────┬───────────────────────────────┘
                                              │
┌─────────────────────────────────────────────┼───────────────────────────────┐
│                            API GATEWAY (Hono + tRPC)                         │
│  [Auth] [Trading] [Predictions] [RWA] [Email] [Rewards] [Webhooks]          │
└─────────────────────────────────────────────┬───────────────────────────────┘
                                              │
┌─────────────────────────────────────────────┼───────────────────────────────┐
│                          ORCHESTRATION LAYER                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Temporal.io Workflows                             │   │
│  │  [KYC/Onboarding] [Order Execution] [Settlement] [Rewards]          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────┬───────────────────────────────┘
                                              │
┌─────────────────────────────────────────────┼───────────────────────────────┐
│                            DATA LAYER                                        │
│  [Convex - Primary DB]  [Redis - Cache]  [Postgres - Auth]                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Packages Overview

### `packages/types`

Shared TypeScript interfaces:
- User, Auth, KYC types
- Trading, Order, Position types
- Prediction market types
- RWA asset types
- Email and messaging types
- Rewards and token types
- API response types

### `packages/db`

Convex database with 26 tables:
- Users, accounts, KYC records
- Balances, orders, positions, trades
- Prediction events and markets
- RWA assets, listings, ownership
- Matrix rooms and messages
- Emails and triage
- Points transactions and rewards
- Audit logs and webhooks

### `packages/core`

Shared business logic:
- Kalshi API client (prediction markets)
- Massive API client (order execution)
- Validation schemas (Zod)
- Formatting utilities

### `packages/ui`

shadcn/ui components:
- Button, Card, Input
- Badge, Avatar, Skeleton
- Utility functions (cn)

## Environment Variables

See `.env.example` for all required variables. Key services:

- **Convex** - Primary database
- **Temporal** - Workflow orchestration
- **Redis** - Caching and rate limiting
- **Kalshi** - Prediction markets API
- **Massive** - Order execution API
- **Persona** - Identity verification
- **Checkr** - Background checks
- **Nylas** - Email sync
- **Anthropic** - AI agents

## Deployment

### CI/CD

GitHub Actions workflows:
- **CI** - Lint, typecheck, build, test on every PR
- **Deploy** - Deploy to staging/production on merge to main

### Infrastructure

- **Web**: Vercel
- **API**: Railway / Fly.io
- **Workers**: Railway / Fly.io
- **Database**: Convex Cloud
- **Temporal**: Temporal Cloud

## License

Proprietary - All rights reserved
