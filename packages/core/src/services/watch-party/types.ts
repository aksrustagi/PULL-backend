/**
 * Watch Party Mode - Type Definitions
 * Synchronized viewing and group betting for live events
 */

// ============================================================================
// Watch Party Status & Types
// ============================================================================

export type WatchPartyStatus =
  | "scheduled"
  | "waiting"
  | "live"
  | "paused"
  | "ended"
  | "cancelled";

export type PartyType =
  | "public"
  | "private"
  | "friends_only"
  | "premium";

export type PartyRole =
  | "host"
  | "co_host"
  | "moderator"
  | "member"
  | "viewer";

export type MessageType =
  | "text"
  | "reaction"
  | "bet_share"
  | "bet_proposal"
  | "poll"
  | "highlight"
  | "system";

export type SyncStatus =
  | "synced"
  | "buffering"
  | "behind"
  | "ahead"
  | "disconnected";

// ============================================================================
// Watch Party
// ============================================================================

export interface WatchParty {
  id: string;
  hostId: string;
  hostUsername: string;

  // Party details
  name: string;
  description?: string;
  imageUrl?: string;
  type: PartyType;
  status: WatchPartyStatus;

  // Event details
  eventId: string;
  eventType: "sports" | "esports" | "prediction_market" | "custom";
  eventName: string;
  sport?: string;
  league?: string;
  homeTeam?: string;
  awayTeam?: string;
  scheduledStart: Date;
  actualStart?: Date;
  endedAt?: Date;

  // Participants
  maxParticipants: number;
  currentParticipants: number;
  inviteCode?: string;
  inviteOnly: boolean;

  // Features
  chatEnabled: boolean;
  bettingEnabled: boolean;
  groupBetEnabled: boolean;
  statsOverlayEnabled: boolean;
  predictionsEnabled: boolean;
  pollsEnabled: boolean;

  // Group betting pool
  groupBetPool: number;
  groupBetContributors: number;

  // Settings
  settings: PartySettings;

  // Stats
  totalMessages: number;
  totalBetsPlaced: number;
  totalBetVolume: number;
  peakViewers: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface PartySettings {
  autoSync: boolean;
  syncTolerance: number; // seconds
  chatDelay: number; // seconds to prevent spoilers
  slowMode: boolean;
  slowModeInterval: number; // seconds between messages
  membersCanInvite: boolean;
  requireApproval: boolean;
  minAccountAge: number; // days
  minVIPTier?: string;
  blockedUsers: string[];
  mutedUsers: string[];
}

// ============================================================================
// Party Members
// ============================================================================

export interface PartyMember {
  id: string;
  partyId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;

  // Role & Status
  role: PartyRole;
  status: "active" | "idle" | "away" | "disconnected";
  syncStatus: SyncStatus;

  // Activity
  lastActive: Date;
  joinedAt: Date;
  leftAt?: Date;

  // Stats
  messagesCount: number;
  betsPlaced: number;
  betVolume: number;
  reactions: number;

  // Group betting
  groupBetContribution: number;
  groupBetShare: number;
}

export interface PartyInvite {
  id: string;
  partyId: string;
  inviterId: string;
  inviteeId?: string;
  inviteeEmail?: string;
  code: string;
  status: "pending" | "accepted" | "declined" | "expired";
  expiresAt: Date;
  createdAt: Date;
  usedAt?: Date;
}

// ============================================================================
// Chat & Messages
// ============================================================================

export interface PartyMessage {
  id: string;
  partyId: string;
  userId: string;
  username: string;
  avatarUrl?: string;

  // Content
  type: MessageType;
  content: string;
  metadata?: MessageMetadata;

  // Threading
  replyToId?: string;
  threadId?: string;

  // Reactions
  reactions: MessageReaction[];
  reactionCounts: Record<string, number>;

  // Moderation
  isDeleted: boolean;
  deletedBy?: string;
  isPinned: boolean;
  pinnedBy?: string;

  // Timestamps
  createdAt: Date;
  editedAt?: Date;
  gameTime?: string; // Time in the game when message was sent
}

export interface MessageMetadata {
  // Bet share
  betId?: string;
  betType?: string;
  betAmount?: number;
  betOdds?: number;
  betSelection?: string;

  // Bet proposal
  proposalId?: string;
  proposalType?: "group" | "individual";
  proposalAmount?: number;
  proposalExpires?: Date;

  // Poll
  pollId?: string;
  pollQuestion?: string;
  pollOptions?: string[];

  // Highlight
  highlightType?: "goal" | "score" | "play" | "stat";
  highlightData?: Record<string, unknown>;
}

export interface MessageReaction {
  userId: string;
  emoji: string;
  createdAt: Date;
}

// ============================================================================
// Group Betting
// ============================================================================

export interface GroupBet {
  id: string;
  partyId: string;
  creatorId: string;
  creatorUsername: string;

  // Bet details
  eventId: string;
  market: string;
  selection: string;
  odds: number;
  targetAmount: number;
  currentAmount: number;

  // Participants
  contributions: BetContribution[];
  minContribution: number;
  maxContribution: number;
  maxParticipants?: number;

  // Status
  status: "collecting" | "locked" | "placed" | "won" | "lost" | "cancelled" | "refunded";
  deadline: Date;
  placedAt?: Date;
  settledAt?: Date;

  // Result
  actualOdds?: number;
  payout?: number;
  profitLoss?: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface BetContribution {
  userId: string;
  username: string;
  amount: number;
  sharePercent: number;
  payout?: number;
  contributedAt: Date;
}

export interface SharedBetSlip {
  id: string;
  partyId: string;
  creatorId: string;

  // Slip details
  bets: SharedBetSlipItem[];
  totalStake: number;
  totalOdds: number;
  potentialPayout: number;

  // Sharing
  visibleToAll: boolean;
  copyCount: number;
  likeCount: number;

  // Status
  status: "draft" | "shared" | "placed" | "settled";
  placedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface SharedBetSlipItem {
  eventId: string;
  eventName: string;
  market: string;
  selection: string;
  odds: number;
  stake: number;
}

// ============================================================================
// Game Sync
// ============================================================================

export interface GameSyncState {
  partyId: string;
  eventId: string;

  // Game state
  status: "pre_game" | "in_progress" | "halftime" | "ended" | "delayed";
  period: string;
  gameTime: string;
  gameClockRunning: boolean;

  // Score
  homeScore: number;
  awayScore: number;
  lastScoreUpdate: Date;

  // Live data
  currentStats: GameStats;
  recentPlays: GamePlay[];
  liveOdds: LiveOdds;

  // Sync
  lastSyncAt: Date;
  syncSource: string;
  latencyMs: number;
}

export interface GameStats {
  eventId: string;
  period: string;
  homeStats: Record<string, number>;
  awayStats: Record<string, number>;
  leaders?: StatLeader[];
  updatedAt: Date;
}

export interface StatLeader {
  playerId: string;
  playerName: string;
  team: "home" | "away";
  stat: string;
  value: number;
}

export interface GamePlay {
  id: string;
  eventId: string;
  type: string;
  description: string;
  team?: "home" | "away";
  player?: string;
  gameTime: string;
  timestamp: Date;
  isScoring: boolean;
  scoreChange?: number;
}

export interface LiveOdds {
  eventId: string;
  markets: {
    marketId: string;
    marketName: string;
    selections: {
      selectionId: string;
      name: string;
      odds: number;
      previousOdds?: number;
      movement: "up" | "down" | "stable";
    }[];
  }[];
  updatedAt: Date;
}

// ============================================================================
// Stats Overlay
// ============================================================================

export interface StatsOverlay {
  partyId: string;
  enabled: boolean;
  position: "top" | "bottom" | "left" | "right";
  transparency: number;

  // Displayed stats
  showScore: boolean;
  showTime: boolean;
  showOdds: boolean;
  showTeamStats: boolean;
  showPlayerStats: boolean;
  showBettingActivity: boolean;

  // Custom widgets
  widgets: OverlayWidget[];
}

export interface OverlayWidget {
  id: string;
  type: "scoreboard" | "odds" | "stats" | "chat" | "betting" | "custom";
  position: { x: number; y: number };
  size: { width: number; height: number };
  settings: Record<string, unknown>;
}

// ============================================================================
// Polls & Predictions
// ============================================================================

export interface PartyPoll {
  id: string;
  partyId: string;
  creatorId: string;
  creatorUsername: string;

  question: string;
  options: PollOption[];
  allowMultiple: boolean;
  anonymous: boolean;

  status: "active" | "closed" | "cancelled";
  expiresAt?: Date;
  closedAt?: Date;

  totalVotes: number;
  createdAt: Date;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
  percent: number;
  voters?: string[];
}

export interface PartyPrediction {
  id: string;
  partyId: string;
  creatorId: string;

  // Prediction details
  question: string;
  options: string[];
  eventTime: string; // When in the game this prediction is for
  deadline: Date;

  // Stakes
  stakeRequired: boolean;
  stakeAmount?: number;
  totalPool: number;

  // Participants
  predictions: UserPrediction[];

  // Resolution
  status: "open" | "locked" | "resolved" | "cancelled";
  correctOption?: number;
  resolvedAt?: Date;

  createdAt: Date;
}

export interface UserPrediction {
  userId: string;
  username: string;
  selectedOption: number;
  stake?: number;
  predictedAt: Date;
  isCorrect?: boolean;
  payout?: number;
}

// ============================================================================
// Service Types
// ============================================================================

export interface CreatePartyParams {
  hostId: string;
  name: string;
  description?: string;
  type: PartyType;
  eventId: string;
  eventType: WatchParty["eventType"];
  eventName: string;
  sport?: string;
  league?: string;
  homeTeam?: string;
  awayTeam?: string;
  scheduledStart: Date;
  maxParticipants?: number;
  inviteOnly?: boolean;
  settings?: Partial<PartySettings>;
}

export interface JoinPartyParams {
  partyId: string;
  userId: string;
  inviteCode?: string;
}

export interface SendMessageParams {
  partyId: string;
  userId: string;
  type: MessageType;
  content: string;
  metadata?: MessageMetadata;
  replyToId?: string;
}

export interface CreateGroupBetParams {
  partyId: string;
  creatorId: string;
  eventId: string;
  market: string;
  selection: string;
  odds: number;
  targetAmount: number;
  minContribution?: number;
  maxContribution?: number;
  deadline: Date;
}

export interface ContributeToGroupBetParams {
  groupBetId: string;
  userId: string;
  amount: number;
}

export interface CreatePollParams {
  partyId: string;
  creatorId: string;
  question: string;
  options: string[];
  allowMultiple?: boolean;
  anonymous?: boolean;
  expiresIn?: number; // seconds
}

export interface SyncStateParams {
  partyId: string;
  eventId: string;
}

// ============================================================================
// Configuration
// ============================================================================

export const WATCH_PARTY_DEFAULTS = {
  maxParticipants: 100,
  syncTolerance: 5, // seconds
  chatDelay: 0,
  slowModeInterval: 3,
  minContribution: 1,
  maxContribution: 100,
  pollDuration: 60, // seconds
  predictionDeadlineBuffer: 30, // seconds before event
};

export const PARTY_ROLE_PERMISSIONS: Record<PartyRole, string[]> = {
  host: [
    "manage_party",
    "manage_members",
    "kick_members",
    "ban_members",
    "moderate_chat",
    "create_group_bet",
    "create_poll",
    "pin_messages",
    "delete_messages",
    "end_party",
  ],
  co_host: [
    "manage_members",
    "kick_members",
    "moderate_chat",
    "create_group_bet",
    "create_poll",
    "pin_messages",
    "delete_messages",
  ],
  moderator: [
    "moderate_chat",
    "pin_messages",
    "delete_messages",
    "mute_members",
  ],
  member: [
    "send_messages",
    "react",
    "join_group_bet",
    "vote_poll",
    "share_bets",
  ],
  viewer: [
    "view_chat",
    "react",
  ],
};
