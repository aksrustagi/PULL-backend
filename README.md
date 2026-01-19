# PULL Super App - Backend

A unified platform for prediction markets, crypto trading, real-world assets (RWAs), messaging, and email intelligence.

## Features

- **Prediction Markets** — Trade on real-world events with YES/NO contracts
- **Crypto Trading** — Buy, sell, and manage crypto portfolio
- **RWA Trading** — Fractional ownership of Pokemon cards and collectibles
- **Email Intelligence** — AI-powered email triage with smart replies
- **Matrix Messaging** — Federated, encrypted messaging
- **Rewards System** — Points, tiers, and redemption marketplace
- **$PULL Token** — Native utility token on Polygon

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
