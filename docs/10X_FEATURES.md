# 10x Feature Enhancement - Implementation Guide

## Overview

This document describes the comprehensive 10x feature enhancement implemented across all fantasy sports modules (NFL, NBA, MLB, Golf, NCAA March Madness). All features are built as reusable, sport-agnostic services that work across all sports.

## Architecture

### Service Layer (`packages/core/src/services/`)

All features follow a consistent pattern:
- **Types file** (`types.ts`) - TypeScript interfaces and types
- **Client file** (`client.ts`) - Service implementation with singleton pattern
- **Index file** (`index.ts`) - Exports for convenient access

### Database Layer (`packages/db/convex/schema.ts`)

30 new tables added to support all features:
- Proper indexing for performance
- Type-safe Convex schema definitions
- Support for all 5 sports (NFL, NBA, MLB, Golf, NCAA)

### API Layer (`apps/api/src/routes/`)

11 new route files with 55 total endpoints:
- Zod validation on all inputs
- Consistent error handling
- Authentication middleware
- Rate limiting

## Feature Details

### 1. Real-Time Presence System
**Service**: `packages/core/src/services/presence/`
**Routes**: `/api/v1/presence/*`
**Database**: `userPresence`, `collaborationSessions`

Features:
- Live collaboration cursors
- Typing indicators in trade negotiations
- "User X is viewing this player" alerts
- CRDT support for offline-first editing
- WebSocket channels per league/room

API Endpoints:
- `POST /api/v1/presence/heartbeat` - Send presence heartbeat
- `GET /api/v1/presence/room/:roomId` - Get users in room
- `POST /api/v1/presence/join` - Join a room
- `POST /api/v1/presence/leave` - Leave a room

### 2. AI-Powered Trade Advisor
**Service**: `packages/core/src/services/ai-trade-advisor/`
**Routes**: `/api/v1/trade-advisor/*`
**Database**: `tradeAnalysis`, `collusionFlags`

Features:
- Natural language trade analyzer
- Counter-offer generator
- Veto probability predictor
- Collusion detection AI
- Sport-specific trade rules

API Endpoints:
- `POST /api/v1/trade-advisor/analyze` - Analyze trade fairness
- `POST /api/v1/trade-advisor/counter-offer` - Generate counter-offers
- `POST /api/v1/trade-advisor/collusion-check` - Check for collusion
- `GET /api/v1/trade-advisor/veto-probability/:tradeId` - Predict veto likelihood

### 3. Voice-First Experience
**Service**: `packages/core/src/services/voice/`
**Routes**: `/api/v1/voice/*`
**Database**: `voiceCommands`, `audioRecaps`

Features:
- Voice commands ("Set my optimal lineup")
- Audio recap generation
- Integration with Live Rooms
- Sport-specific commands
- Whisper API for STT, ElevenLabs/OpenAI for TTS

API Endpoints:
- `POST /api/v1/voice/command` - Process voice command
- `GET /api/v1/voice/recap/:date` - Get audio recap
- `POST /api/v1/voice/text-to-speech` - Convert text to speech

### 4. Computer Vision Features
**Service**: `packages/core/src/services/vision/`
**Routes**: `/api/v1/vision/*`
**Database**: `screenshotAnalysis`

Features:
- Screenshot-to-trade parser
- TV sync mode
- Jersey scanner
- OpenAI Vision or Claude Vision integration

API Endpoints:
- `POST /api/v1/vision/screenshot-to-trade` - Parse trade from screenshot
- `POST /api/v1/vision/jersey-scan` - Scan jersey for player stats
- `POST /api/v1/vision/tv-sync` - Sync with TV broadcast
- `POST /api/v1/vision/analyze` - Generic screenshot analysis

### 5. Predictive Injury Alerts
**Service**: `packages/core/src/services/injury-prediction/`
**Routes**: `/api/v1/injuries/*`
**Database**: `injuryRiskScores`, `injuryHistory`

Features:
- ML model analyzing snap counts, age, play type
- Risk scores for each player
- High-risk start warnings
- Insurance pricing
- Sport-specific injury patterns

API Endpoints:
- `GET /api/v1/injuries/risk/:playerId` - Get injury risk score
- `GET /api/v1/injuries/lineup-risk/:teamId` - Get lineup risk assessment
- `GET /api/v1/injuries/insurance-quote/:playerId` - Get insurance quote
- `GET /api/v1/injuries/history/:playerId` - Get injury history

### 6. Social Graph & League Discovery
**Service**: `packages/core/src/services/social-graph/`
**Routes**: `/api/v1/social/*`
**Database**: `userConnections`, `leagueReputation`, `contactImports`

Features:
- Contact import with permission
- Friends-of-friends recommendations
- LinkedIn-style connection suggestions
- League reputation scores
- Public league search

API Endpoints:
- `GET /api/v1/social/connections` - Get user connections
- `POST /api/v1/social/import-contacts` - Import contacts
- `GET /api/v1/social/league-recommendations` - Get league recommendations
- `GET /api/v1/social/suggestions` - Get friend suggestions
- `POST /api/v1/social/search-leagues` - Search public leagues
- `GET /api/v1/social/reputation/:leagueId` - Get league reputation

### 7. Embedded Financial Services
**Service**: `packages/core/src/services/finance/`
**Routes**: `/api/v1/finance/*`
**Database**: `virtualCards`, `taxDocuments`, `cryptoWallets`

Features:
- Virtual PULL Card with cashback
- Instant withdrawals
- Enhanced crypto support (BTC, ETH, USDC, SOL)
- Tax document generation (1099 forms)
- Auto-invest winnings
- Deposit bonuses

API Endpoints:
- `POST /api/v1/finance/virtual-card/create` - Create virtual card
- `POST /api/v1/finance/withdraw/instant` - Instant withdrawal
- `POST /api/v1/finance/crypto/connect-wallet` - Connect crypto wallet
- `GET /api/v1/finance/tax-documents/:year` - Get tax documents
- `POST /api/v1/finance/auto-invest/configure` - Configure auto-invest

### 8. Advanced Analytics Dashboard
**Service**: `packages/core/src/services/analytics/advanced/`
**Routes**: `/api/v1/analytics/*`
**Database**: `playoffSimulations`, `benchAnalysis`, `draftGrades`

Features:
- Playoff probability simulator (Monte Carlo with 10,000+ iterations)
- Points left on bench tracker
- Optimal lineup hindsight
- Head-to-head history visualization
- Draft grade with hindsight
- Win probability charts
- Trend analysis

API Endpoints:
- `GET /api/v1/analytics/playoff-odds/:teamId` - Run playoff simulation
- `GET /api/v1/analytics/bench-analysis/:teamId` - Get bench analysis
- `GET /api/v1/analytics/optimal-lineup/:teamId/:week` - Get optimal lineup
- `GET /api/v1/analytics/h2h-history/:teamId/:opponentId` - Get H2H history
- `GET /api/v1/analytics/draft-grade/:teamId` - Get draft grade
- `GET /api/v1/analytics/player-trend/:playerId` - Analyze player trend

### 9. Engagement & Retention Mechanics
**Service**: `packages/core/src/services/engagement/`
**Routes**: `/api/v1/engagement/*`
**Database**: `userStreaks`, `seasonPasses`, `achievements`, `yearInReview`, `leagueTrophies`

Features:
- Streak multipliers (2x XP for 3+ day streaks)
- Season pass system (free and premium)
- Exclusive rewards
- Revenge game notifications
- Custom league trophies (mintable NFTs)
- Year-in-review generator
- Daily/weekly challenges

API Endpoints:
- `GET /api/v1/engagement/streak` - Get user streak
- `POST /api/v1/engagement/claim-daily` - Claim daily reward
- `GET /api/v1/engagement/season-pass` - Get season pass
- `GET /api/v1/engagement/year-in-review` - Generate year-in-review
- `POST /api/v1/engagement/mint-trophy` - Mint championship NFT
- `GET /api/v1/engagement/daily-challenges` - Get daily challenges
- `GET /api/v1/engagement/revenge-games` - Get revenge game alerts

### 10. Compliance & Trust Features
**Service**: `packages/core/src/services/compliance/`
**Routes**: `/api/v1/compliance/*`
**Database**: `selfExclusions`, `depositLimits`, `sessionLimits`, `geoChecks`, `auditLogs`

Features:
- Responsible gaming (self-exclusion, deposit limits, cool-off periods, session limits)
- State-by-state geofencing
- Transparent LMSR odds explanation
- Complete audit trail
- Third-party verification badges
- Age verification
- Problem gambling resources

API Endpoints:
- `POST /api/v1/compliance/self-exclude` - Create self-exclusion
- `POST /api/v1/compliance/deposit-limit` - Set deposit limit
- `POST /api/v1/compliance/session-limit` - Set session limit
- `POST /api/v1/compliance/cool-off` - Start cool-off period
- `GET /api/v1/compliance/geo-check` - Check geolocation
- `GET /api/v1/compliance/audit-log/:entityType/:entityId` - Get audit trail
- `GET /api/v1/compliance/settings` - Get all settings
- `GET /api/v1/compliance/odds-explanation/:marketId` - Explain odds calculation

### 11. Second Screen Experience
**Service**: `packages/core/src/services/second-screen/`
**Routes**: `/api/v1/widgets/*`
**Database**: N/A (ephemeral data)

Features:
- Apple Watch app with complications
- Wear OS app
- CarPlay/Android Auto integration
- Smart TV apps (tvOS, Android TV, Fire TV)
- iOS/Android widget stack

API Endpoints:
- `GET /api/v1/widgets/home-screen` - Get home screen widget data
- `GET /api/v1/widgets/watch-complications` - Get watch complication data
- `GET /api/v1/tv/dashboard` - Get TV dashboard layout
- `POST /api/v1/widgets/carplay/update` - Send CarPlay audio update

## Usage Examples

### Example 1: Analyze a Trade

```typescript
// POST /api/v1/trade-advisor/analyze
const response = await fetch('/api/v1/trade-advisor/analyze', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    sport: 'nfl',
    leagueId: 'league_123',
    teamIdOffering: 'team_456',
    teamIdReceiving: 'team_789',
    playersOffered: ['player_1', 'player_2'],
    playersReceived: ['player_3'],
    naturalLanguageQuery: 'Should I trade Ja\'Marr Chase for Travis Kelce?'
  })
});

const { data } = await response.json();
// {
//   tradeId: '...',
//   fairnessScore: 52,
//   recommendation: 'counter',
//   teamOfferingGrade: 'B+',
//   teamReceivingGrade: 'A-',
//   reasoning: '...',
//   collusionRisk: 5,
//   vetoLikelihood: 20,
//   ...
// }
```

### Example 2: Run Playoff Simulation

```typescript
// GET /api/v1/analytics/playoff-odds/team_123?leagueId=league_456&sport=nfl
const response = await fetch('/api/v1/analytics/playoff-odds/team_123?leagueId=league_456&sport=nfl', {
  headers: {
    'Authorization': 'Bearer <token>'
  }
});

const { data } = await response.json();
// {
//   simulationId: '...',
//   iterations: 10000,
//   results: {
//     makePlayoffs: 78.5,
//     finishFirst: 23.2,
//     finishSecond: 30.1,
//     finishThird: 25.2,
//     missPlayoffs: 21.5
//   },
//   scenarioBreakdown: [...]
// }
```

### Example 3: Voice Command

```typescript
// POST /api/v1/voice/command
const response = await fetch('/api/v1/voice/command', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    audioUrl: 'https://...',
    sport: 'nfl',
    leagueId: 'league_123',
    teamId: 'team_456'
  })
});

const { data } = await response.json();
// {
//   commandId: '...',
//   rawTranscript: 'Set my optimal lineup',
//   parsedAction: 'set_lineup',
//   confidence: 0.95,
//   status: 'completed',
//   result: { ... }
// }
```

## Development

### Running the API

```bash
npm run dev:api
```

### Testing

```bash
# Unit tests
npm test

# Integration tests
npm test:integration

# E2E tests
npm test:e2e
```

### Linting

```bash
npm run lint
npm run lint:fix
```

## Deployment

All features are behind feature flags and can be enabled gradually:

```typescript
const FEATURE_FLAGS = {
  presence: true,
  aiTradeAdvisor: true,
  voice: false, // Not yet enabled
  vision: false,
  injuryPrediction: true,
  socialGraph: true,
  finance: false, // Requires additional compliance
  analytics: true,
  engagement: true,
  compliance: true,
  secondScreen: false,
};
```

## Security Considerations

1. **Authentication**: All routes require JWT authentication
2. **Rate Limiting**: Applied to all /api/v1/* routes
3. **Input Validation**: Zod schemas on all inputs
4. **Geofencing**: Compliance service checks user location
5. **Audit Logging**: All sensitive actions are logged
6. **Age Verification**: Required for financial features
7. **Responsible Gaming**: Self-exclusion and limits enforced

## Performance Considerations

1. **Caching**: Simulation results cached for 1 hour
2. **Indexes**: All database tables properly indexed
3. **Rate Limiting**: Prevents abuse and ensures fairness
4. **WebSocket**: For real-time presence updates
5. **Pagination**: All list endpoints support pagination
6. **Lazy Loading**: Heavy computations run asynchronously

## Future Enhancements

1. **GraphQL Subscriptions**: Real-time updates alternative
2. **Edge Caching**: Cloudflare Workers integration
3. **Multi-region Deployment**: Automatic failover
4. **Database Sharding**: For high-traffic periods
5. **Queue System**: For burst traffic handling
6. **Chaos Engineering**: NFL Sunday traffic simulation

## Support

For questions or issues, please contact the development team or file an issue in the repository.
