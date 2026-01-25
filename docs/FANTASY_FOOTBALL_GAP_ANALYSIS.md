# Fantasy Football Platform - Gap Analysis

## Executive Summary

After reviewing the current PULL-backend codebase against the Fantasy Football Platform 2-Week Prototype Plan, this document identifies what currently exists, what's missing, and what needs to be built.

**Current State**: The PULL platform is a comprehensive super app with prediction markets (Kalshi), RWA trading (Pokemon cards/collectibles), Matrix messaging, email intelligence, and rewards - but has **no fantasy football-specific features**.

**Effort Estimate**: ~70% of the Fantasy Football Platform needs to be built from scratch.

---

## What Currently Exists (Reusable)

### 1. Backend Infrastructure ✅
| Component | Status | Details |
|-----------|--------|---------|
| Hono API Server | ✅ Exists | `apps/api/` - Production-ready with middleware |
| Authentication | ✅ Exists | JWT-based auth with refresh tokens |
| Rate Limiting | ✅ Exists | Upstash Redis-based |
| tRPC Support | ✅ Exists | Type-safe RPC endpoints |
| Error Handling | ✅ Exists | Global error handler, typed errors |

### 2. Database & ORM ⚠️ Different Technology
| Spec Requirement | Current Implementation | Gap |
|------------------|----------------------|-----|
| PostgreSQL + Drizzle ORM | **Convex** (serverless DB) | Major architecture difference |
| Redis for caching | ✅ Redis exists | Can reuse |
| SQL migrations | Convex schema-based | Different paradigm |

**Note**: The spec calls for PostgreSQL + Drizzle, but current implementation uses Convex. Options:
1. Add PostgreSQL/Drizzle alongside Convex for fantasy features
2. Extend Convex schema for fantasy tables
3. Build separate fantasy-backend service as specified

### 3. Matrix Integration ✅ Partially Exists
| Component | Status | Notes |
|-----------|--------|-------|
| Matrix rooms table | ✅ Exists | `matrixRooms` in Convex |
| Matrix messages table | ✅ Exists | `matrixMessages` in Convex |
| Room creation workflow | ✅ Exists | `room-creation.workflow.ts` |
| Bridge message workflow | ✅ Exists | `bridge-message.workflow.ts` with trade commands |
| Matrix Docker setup | ❌ Missing | Need Synapse, Element, bridges config |
| Discord/Slack/Telegram bridges | ❌ Missing | Referenced in workflow but not implemented |

### 4. Prediction Markets ⚠️ Different Model
| Spec Requirement | Current Implementation | Gap |
|------------------|----------------------|-----|
| Custom LMSR market maker | Kalshi integration (external) | Need custom market maker |
| Fantasy matchup markets | ❌ Not implemented | Need league-specific markets |
| Player prop bets | ❌ Not implemented | Need sports data integration |
| Wallet/betting balance | ✅ Exists (`balances` table) | Can extend |

### 5. Temporal Workflows ✅ Exists
| Workflow Type | Status | Can Reuse? |
|---------------|--------|------------|
| Trading workflows | ✅ Exists | Yes, for bet execution |
| Messaging workflows | ✅ Exists | Yes, for league chat |
| KYC workflows | ✅ Exists | Yes, for user verification |
| Rewards workflows | ✅ Exists | Yes, for fantasy rewards |

### 6. Frontend (Next.js) ✅ Exists
| Component | Status | Notes |
|-----------|--------|-------|
| Auth pages | ✅ Exists | Login, register, verify, forgot-password |
| Dashboard | ✅ Exists | Basic dashboard structure |
| Trade pages | ✅ Exists | `/trade`, `/trade/[ticker]` |
| Portfolio | ✅ Exists | Position management |
| Rewards | ✅ Exists | Points and rewards UI |

### 7. Docker Setup ⚠️ Partial
| Component | Status | Notes |
|-----------|--------|-------|
| PostgreSQL | ✅ Exists | `postgres:16-alpine` |
| Redis | ✅ Exists | `redis:7-alpine` |
| Temporal | ✅ Exists | With UI and admin tools |
| Synapse (Matrix) | ❌ Missing | Need to add |
| Element Web | ❌ Missing | Need to add |
| Matrix bridges | ❌ Missing | Need to add |

---

## What's Missing (Needs to be Built)

### Phase 1: Foundation (Days 1-3)

#### 1.1 Fantasy Database Schema ❌ NOT IMPLEMENTED
Need to add these tables (either to Convex or as PostgreSQL/Drizzle):

```
❌ leagues - League configuration and settings
❌ teams - Fantasy teams within leagues
❌ players - NFL player database
❌ rosters - Player-to-team assignments with slots
❌ matchups - Weekly head-to-head matchups
❌ markets (fantasy) - League-specific prediction markets
❌ bets - User bets on fantasy markets
❌ transactions (fantasy) - Waivers, trades, adds/drops
```

#### 1.2 Sports Data Service ❌ NOT IMPLEMENTED
```
❌ ESPN API client (unofficial API integration)
❌ Live scores/stats fetching
❌ Player projections
❌ Redis caching for sports data
❌ SportsRadar fallback (optional)
```

**Files to Create:**
- `packages/core/src/services/sports-data/client.ts`
- `packages/core/src/services/sports-data/types.ts`
- `packages/core/src/services/sports-data/espn.ts`
- `packages/core/src/services/sports-data/sportsradar.ts`

#### 1.3 Fantasy Scoring Engine ❌ NOT IMPLEMENTED
```
❌ PPR/Half-PPR/Standard scoring rules
❌ calculatePlayerScore()
❌ calculateTeamScore()
❌ projectTeamScore()
❌ Real-time scoring via pub/sub
```

**Files to Create:**
- `packages/core/src/services/fantasy/scoring.ts`
- `packages/core/src/services/fantasy/types.ts`

#### 1.4 Fantasy API Routes ❌ NOT IMPLEMENTED
```
❌ /api/v1/leagues/* - League CRUD
❌ /api/v1/teams/* - Team management
❌ /api/v1/players/* - Player search/stats
❌ /api/v1/transactions/* - Waivers/trades
```

**Files to Create:**
- `apps/api/src/routes/fantasy/leagues.ts`
- `apps/api/src/routes/fantasy/teams.ts`
- `apps/api/src/routes/fantasy/players.ts`
- `apps/api/src/routes/fantasy/transactions.ts`
- `apps/api/src/routes/fantasy/index.ts`

---

### Phase 2: Prediction Markets (Day 3)

#### 2.1 Custom Market Maker ❌ NOT IMPLEMENTED
Current system uses Kalshi (external). Need custom LMSR:

```
❌ LMSR odds calculation
❌ Dynamic odds adjustment
❌ Liquidity pool management
❌ Implied probability calculation
❌ Slippage protection
```

**Files to Create:**
- `packages/core/src/services/markets/market-maker.ts`
- `packages/core/src/services/markets/lmsr.ts`
- `packages/core/src/services/markets/types.ts`

#### 2.2 Fantasy Markets Routes ❌ NOT IMPLEMENTED
```
❌ Global markets browse
❌ League-specific markets
❌ Matchup betting
❌ Cash out functionality
```

**Files to Create:**
- `apps/api/src/routes/fantasy/markets.ts`

---

### Phase 3: Matrix Integration (Days 4-7)

#### 3.1 Matrix Docker Infrastructure ❌ NOT IMPLEMENTED
```
❌ docker/matrix/docker-compose.yml
❌ Synapse homeserver configuration
❌ Element Web with custom branding
❌ Discord bridge (mautrix-discord)
❌ Slack bridge (mautrix-slack)
❌ Telegram bridge (mautrix-telegram)
❌ Bridge registration scripts
```

**Directory to Create:**
- `docker/matrix/`
- `docker/matrix/synapse/`
- `docker/matrix/element/`
- `docker/matrix/bridges/`

#### 3.2 Matrix Client Service ⚠️ PARTIALLY EXISTS
Current implementation has workflows but missing:
```
❌ matrix-js-sdk wrapper service
❌ Admin API functions
❌ League room creation with proper settings
❌ Bridge connection management
❌ Rich message formatting (trades, scores, markets)
```

**Files to Create/Extend:**
- `packages/core/src/services/matrix/client.ts`
- `packages/core/src/services/matrix/admin.ts`
- `packages/core/src/services/matrix/messages.ts`

#### 3.3 Matrix API Routes ❌ NOT IMPLEMENTED
```
❌ /api/v1/matrix/register
❌ /api/v1/matrix/rooms
❌ /api/v1/matrix/bridges
❌ /webhooks/matrix
```

**Files to Create:**
- `apps/api/src/routes/matrix.ts`

---

### Phase 4: MCP Servers (Days 6-7) ❌ NOT IMPLEMENTED

#### 4.1 Fantasy MCP Server ❌ NOT IMPLEMENTED
```
❌ mcp-servers/fantasy/src/index.ts
❌ League management tools
❌ Player search tools
❌ Market/betting tools
❌ Social/trade tools
```

**Directory to Create:**
- `mcp-servers/fantasy/`

#### 4.2 MCP Client Integration ❌ NOT IMPLEMENTED
```
❌ MCP client for connecting to external servers
❌ Tool registry
❌ AI orchestrator for tool chains
```

**Files to Create:**
- `packages/core/src/mcp/client.ts`
- `packages/core/src/mcp/registry.ts`
- `apps/api/src/routes/mcp.ts`

---

### Phase 5: React Native Mobile App (Days 8-12) ❌ NOT IMPLEMENTED

#### 5.1 Expo Project ❌ NOT IMPLEMENTED
The spec calls for a complete React Native Expo app:

```
❌ fantasy-mobile/ directory
❌ Expo Router navigation
❌ 92 screens for ESPN parity
❌ NativeWind/Tailwind styling
❌ Zustand state management
❌ TanStack Query data fetching
❌ Matrix SDK integration
```

**Directory to Create:**
- `apps/mobile/` (or `fantasy-mobile/`)

#### 5.2 Core UI Components ❌ NOT IMPLEMENTED
```
❌ Button, Card, Input, Badge
❌ Avatar, Tabs, BottomSheet
❌ OddsDisplay, ScoreCard
❌ PlayerCard, StandingsRow
❌ BetSlip, MarketCard
```

#### 5.3 Screen Categories (92 Total)
| Category | Count | Status |
|----------|-------|--------|
| Onboarding | 6 | ❌ Missing |
| Home Tab | 8 | ❌ Missing |
| Leagues Tab | 18 | ❌ Missing |
| Transactions | 10 | ❌ Missing |
| Draft | 8 | ❌ Missing |
| Markets Tab | 18 | ❌ Missing |
| Chat Tab | 12 | ❌ Missing |
| Profile Tab | 10 | ❌ Missing |
| Modals/Sheets | 10 | ❌ Missing |

---

### Phase 6: Testing & Deployment (Days 13-14)

#### 6.1 Integration Tests ❌ NOT IMPLEMENTED
```
❌ Backend tests (Vitest)
❌ Mobile tests (Jest + RNTL)
❌ E2E tests (Detox optional)
```

#### 6.2 CI/CD ❌ NOT IMPLEMENTED
```
❌ .github/workflows/backend.yml
❌ .github/workflows/mobile.yml
❌ .github/workflows/matrix.yml
❌ Railway/Render deployment config
❌ EAS build configuration
```

#### 6.3 Documentation ❌ MINIMAL
```
❌ docs/SETUP.md
❌ docs/API.md (OpenAPI spec)
❌ docs/MATRIX.md
❌ docs/MOBILE.md
❌ docs/MCP.md
```

---

## Priority Implementation Order

### Week 1: Core Backend + Markets

| Day | Focus | Components to Build |
|-----|-------|---------------------|
| 1 | Database Schema | Add fantasy tables to Convex OR create PostgreSQL/Drizzle setup |
| 2 | Sports Data | ESPN client, caching, player data sync |
| 2 | Scoring Engine | PPR scoring, team calculations |
| 3 | Fantasy Routes | Leagues, teams, players, transactions APIs |
| 3 | Market Maker | LMSR implementation, odds calculation |
| 4-5 | Matrix Docker | Synapse, Element, bridges setup |
| 6-7 | MCP Server | Fantasy tools, AI orchestrator |

### Week 2: Mobile + Polish

| Day | Focus | Components to Build |
|-----|-------|---------------------|
| 8-9 | Mobile Setup | Expo project, navigation, design system |
| 9-10 | Core Components | UI library, theming |
| 10-11 | Main Screens | Home, leagues, roster, matchups |
| 11-12 | Markets + Chat | Betting UI, Matrix chat |
| 13 | Testing | Integration tests, edge cases |
| 14 | Deployment | CI/CD, documentation |

---

## Recommended Approach

### Option A: Extend Current Codebase (Recommended)
Add fantasy module to existing PULL-backend:
- Add fantasy tables to Convex schema
- Add `apps/api/src/routes/fantasy/` routes
- Add `packages/core/src/services/fantasy/` services
- Add `apps/mobile/` for React Native
- Extend existing Matrix integration

**Pros**: Reuse auth, rate limiting, workflows, rewards
**Cons**: Mixes real estate/trading with fantasy

### Option B: Separate Fantasy Backend (Per Spec)
Create new `fantasy-backend/` as specified:
- Clean Hono + Drizzle + PostgreSQL
- Dedicated fantasy-only codebase
- Can be split out later

**Pros**: Clean separation, follows spec exactly
**Cons**: Duplicates infrastructure, more work

### Option C: Hybrid Approach
- Use existing backend for shared services (auth, Matrix, rewards)
- Create separate `apps/fantasy-api/` for fantasy-specific routes
- Share `packages/core/` services

---

## Files to Create Summary

### Backend (~35 files)
```
packages/core/src/services/fantasy/
├── index.ts
├── types.ts
├── scoring.ts
├── league-manager.ts
└── draft.ts

packages/core/src/services/sports-data/
├── index.ts
├── types.ts
├── client.ts
├── espn.ts
└── cache.ts

packages/core/src/services/markets/
├── index.ts
├── types.ts
├── market-maker.ts
└── lmsr.ts

packages/core/src/services/matrix/
├── client.ts (extend)
├── admin.ts
└── messages.ts

packages/core/src/workflows/fantasy/
├── index.ts
├── activities.ts
├── draft.workflow.ts
├── scoring.workflow.ts
├── waiver.workflow.ts
└── trade.workflow.ts

apps/api/src/routes/fantasy/
├── index.ts
├── leagues.ts
├── teams.ts
├── players.ts
├── transactions.ts
└── markets.ts

apps/api/src/routes/matrix.ts
apps/api/src/routes/mcp.ts
```

### Database Schema (~10 tables)
```
packages/db/convex/schema.ts (extend with):
- fantasyLeagues
- fantasyTeams
- fantasyPlayers
- fantasyRosters
- fantasyMatchups
- fantasyMarkets
- fantasyBets
- fantasyTransactions
- fantasyDrafts
- fantasyDraftPicks
```

### Docker (~15 files)
```
docker/matrix/
├── docker-compose.yml
├── synapse/
│   ├── homeserver.yaml
│   └── log.config
├── element/
│   └── config.json
├── bridges/
│   ├── discord/config.yaml
│   ├── slack/config.yaml
│   └── telegram/config.yaml
└── scripts/
    ├── generate-config.sh
    ├── register-bridges.sh
    └── start.sh
```

### MCP Server (~10 files)
```
mcp-servers/fantasy/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── tools/
│   │   ├── league.ts
│   │   ├── player.ts
│   │   ├── market.ts
│   │   └── social.ts
│   └── client.ts
```

### Mobile App (~100+ files)
```
apps/mobile/
├── app/                    # Expo Router (92 screens)
├── components/
│   ├── ui/                 # Core UI (~20 components)
│   ├── fantasy/            # Fantasy components (~15)
│   ├── markets/            # Market components (~10)
│   └── chat/               # Chat components (~10)
├── hooks/                  # Custom hooks (~10)
├── services/               # API clients (~5)
├── stores/                 # Zustand stores (~5)
└── types/                  # TypeScript types (~5)
```

### CI/CD & Docs (~10 files)
```
.github/workflows/
├── backend.yml
├── mobile.yml
└── matrix.yml

docs/
├── SETUP.md
├── API.md
├── MATRIX.md
├── MOBILE.md
├── MCP.md
└── TESTING.md
```

---

## Estimated Effort

| Component | New Files | Estimated Hours |
|-----------|-----------|-----------------|
| Fantasy Backend | ~35 | 40-50 hrs |
| Database Schema | ~10 tables | 8-10 hrs |
| Sports Data Service | ~5 | 12-16 hrs |
| Market Maker | ~4 | 16-20 hrs |
| Matrix Docker | ~15 | 12-16 hrs |
| MCP Server | ~10 | 16-20 hrs |
| Mobile App | ~100+ | 80-100 hrs |
| Testing | ~20 | 16-20 hrs |
| CI/CD & Docs | ~10 | 8-12 hrs |
| **Total** | **~200+** | **~200-260 hrs** |

---

## Next Steps

1. **Decide Architecture**: Extend existing vs separate backend
2. **Set Up Database**: Add fantasy tables to Convex OR set up Drizzle
3. **Build Sports Data Service**: ESPN integration first
4. **Create Fantasy Routes**: Start with leagues and teams
5. **Implement Market Maker**: LMSR for fantasy betting
6. **Set Up Matrix Docker**: Synapse + Element + bridges
7. **Build Mobile App**: Start with navigation and core screens
8. **Add Testing**: Integration tests as features complete
9. **Deploy**: CI/CD pipelines and documentation

---

*Generated: 2026-01-22*
*Based on: PULL-backend main branch + PR #1*
