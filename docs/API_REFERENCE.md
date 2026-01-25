# 10x Features API Reference

Quick reference for all new API endpoints.

## Base URL
```
https://api.pull.app/api/v1
```

## Authentication
All endpoints require Bearer token authentication:
```
Authorization: Bearer <your_jwt_token>
```

---

## Presence System

### Send Heartbeat
```http
POST /presence/heartbeat
Content-Type: application/json

{
  "roomId": "string",
  "cursor": { "x": 100, "y": 200, "elementId": "player_123" },
  "status": "active" | "idle" | "away"
}
```

### Get Room Presence
```http
GET /presence/room/:roomId
```

### Join Room
```http
POST /presence/join

{
  "roomId": "string",
  "roomType": "roster" | "trade" | "waiver" | "draft" | "lineup",
  "sport": "nfl" | "nba" | "mlb" | "golf" | "ncaa"
}
```

---

## AI Trade Advisor

### Analyze Trade
```http
POST /trade-advisor/analyze

{
  "sport": "nfl",
  "leagueId": "string",
  "teamIdOffering": "string",
  "teamIdReceiving": "string",
  "playersOffered": ["string"],
  "playersReceived": ["string"],
  "naturalLanguageQuery": "Should I trade X for Y?"
}
```

### Generate Counter Offer
```http
POST /trade-advisor/counter-offer

{
  "originalTradeId": "string",
  "constraints": {
    "maxPlayers": 3,
    "positions": ["QB", "RB"],
    "excludePlayerIds": ["player_1"]
  }
}
```

### Check Collusion
```http
POST /trade-advisor/collusion-check

{
  "tradeId": "string"
}
```

### Predict Veto Probability
```http
GET /trade-advisor/veto-probability/:tradeId
```

---

## Voice Commands

### Process Voice Command
```http
POST /voice/command

{
  "audioUrl": "https://...",
  "sport": "nfl",
  "leagueId": "string",
  "teamId": "string"
}
```

### Get Audio Recap
```http
GET /voice/recap/:date?sport=nfl&leagueId=string
```

### Text to Speech
```http
POST /voice/text-to-speech

{
  "text": "string",
  "voice": "alloy",
  "speed": 1.0,
  "format": "mp3"
}
```

---

## Computer Vision

### Parse Trade Screenshot
```http
POST /vision/screenshot-to-trade

{
  "imageUrl": "https://...",
  "sport": "nfl"
}
```

### Scan Jersey
```http
POST /vision/jersey-scan

{
  "imageUrl": "https://..."
}
```

### TV Sync
```http
POST /vision/tv-sync

{
  "imageUrl": "https://..."
}
```

---

## Injury Prediction

### Get Risk Score
```http
GET /injuries/risk/:playerId?sport=nfl
```

### Get Lineup Risk
```http
GET /injuries/lineup-risk/:teamId?playerIds=p1,p2,p3
```

### Get Insurance Quote
```http
GET /injuries/insurance-quote/:playerId?duration=week
```

### Get Injury History
```http
GET /injuries/history/:playerId
```

---

## Social Graph

### Get Connections
```http
GET /social/connections
```

### Import Contacts
```http
POST /social/import-contacts

{
  "source": "google" | "apple" | "csv",
  "contacts": []
}
```

### Get League Recommendations
```http
GET /social/league-recommendations
```

### Search Leagues
```http
POST /social/search-leagues

{
  "sport": "nfl",
  "buyInMin": 50,
  "buyInMax": 500,
  "competitivenessLevel": "competitive",
  "minReputation": 80,
  "openSpotsOnly": true
}
```

### Get League Reputation
```http
GET /social/reputation/:leagueId
```

---

## Finance

### Create Virtual Card
```http
POST /finance/virtual-card/create
```

### Instant Withdrawal
```http
POST /finance/withdraw/instant

{
  "amount": 100.50,
  "destination": {
    "type": "bank" | "paypal" | "venmo" | "crypto",
    "accountId": "string"
  }
}
```

### Connect Crypto Wallet
```http
POST /finance/crypto/connect-wallet

{
  "walletAddress": "0x...",
  "blockchain": "ethereum"
}
```

### Get Tax Documents
```http
GET /finance/tax-documents/:year
```

### Configure Auto-Invest
```http
POST /finance/auto-invest/configure

{
  "enabled": true,
  "percentage": 10,
  "minThreshold": 100,
  "destination": "savings"
}
```

---

## Analytics

### Playoff Odds Simulation
```http
GET /analytics/playoff-odds/:teamId?leagueId=string&sport=nfl
```

### Bench Analysis
```http
GET /analytics/bench-analysis/:teamId?leagueId=string&season=2024
```

### Optimal Lineup
```http
GET /analytics/optimal-lineup/:teamId/:week
```

### Head-to-Head History
```http
GET /analytics/h2h-history/:teamId/:opponentId?leagueId=string
```

### Draft Grade
```http
GET /analytics/draft-grade/:teamId?leagueId=string&season=2024
```

### Player Trend Analysis
```http
GET /analytics/player-trend/:playerId?sport=nfl
```

---

## Engagement

### Get Streak
```http
GET /engagement/streak
```

### Claim Daily Reward
```http
POST /engagement/claim-daily

{
  "challengeId": "string"
}
```

### Get Season Pass
```http
GET /engagement/season-pass?season=2024
```

### Get Year in Review
```http
GET /engagement/year-in-review?year=2024
```

### Mint Trophy
```http
POST /engagement/mint-trophy

{
  "leagueId": "string",
  "seasonId": "string",
  "trophyType": "champion"
}
```

### Get Daily Challenges
```http
GET /engagement/daily-challenges?sport=nfl
```

### Get Revenge Games
```http
GET /engagement/revenge-games
```

---

## Compliance

### Self-Exclude
```http
POST /compliance/self-exclude

{
  "durationDays": 30 | "permanent",
  "reason": "optional"
}
```

### Set Deposit Limit
```http
POST /compliance/deposit-limit

{
  "limitType": "daily" | "weekly" | "monthly",
  "amount": 1000
}
```

### Set Session Limit
```http
POST /compliance/session-limit

{
  "maxDurationMinutes": 180
}
```

### Cool-Off Period
```http
POST /compliance/cool-off

{
  "durationHours": 24
}
```

### Geo Check
```http
GET /compliance/geo-check
```

### Get Audit Log
```http
GET /compliance/audit-log/:entityType/:entityId
```

### Get Settings
```http
GET /compliance/settings
```

### Explain Odds
```http
GET /compliance/odds-explanation/:marketId
```

---

## Widgets & Second Screen

### Home Screen Widget
```http
GET /widgets/home-screen?type=lineup
```

### Watch Complications
```http
GET /widgets/watch-complications
```

### TV Dashboard
```http
GET /tv/dashboard?sport=nfl
```

### CarPlay Update
```http
POST /widgets/carplay/update

{
  "message": "Your player scored!",
  "priority": "high"
}
```

---

## Response Format

All endpoints return responses in this format:

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-01-25T12:00:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  },
  "timestamp": "2024-01-25T12:00:00.000Z"
}
```

## Rate Limits

- **Standard**: 100 requests per minute
- **Analytics**: 10 simulations per hour
- **Voice**: 20 requests per minute
- **Vision**: 10 requests per minute

## Error Codes

- `UNAUTHORIZED` (401) - Missing or invalid authentication
- `FORBIDDEN` (403) - User doesn't have permission
- `BAD_REQUEST` (400) - Invalid input
- `NOT_FOUND` (404) - Resource not found
- `RATE_LIMIT_EXCEEDED` (429) - Too many requests
- `INTERNAL_SERVER_ERROR` (500) - Server error

## Webhooks

Some features support webhooks for real-time updates:

- Presence updates
- Trade analysis completion
- Injury risk changes
- Playoff simulation completion

Configure webhooks in your account settings.
