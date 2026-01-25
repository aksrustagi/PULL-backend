/**
 * Prop Builder - Type Definitions
 * User-created custom proposition bets
 */

// ============================================================================
// Prop Status & Types
// ============================================================================

export type PropStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "active"
  | "paused"
  | "closed"
  | "settling"
  | "settled"
  | "cancelled"
  | "disputed";

export type PropType =
  | "binary"           // Yes/No
  | "multiple_choice"  // Multiple outcomes
  | "numeric"          // Over/Under a number
  | "range"            // Value falls in range
  | "head_to_head"     // Player vs Player
  | "parlay";          // Combined props

export type PropCategory =
  | "sports"
  | "politics"
  | "entertainment"
  | "crypto"
  | "weather"
  | "social_media"
  | "gaming"
  | "custom";

export type ModerationStatus =
  | "pending"
  | "in_review"
  | "approved"
  | "rejected"
  | "flagged"
  | "escalated";

export type ResolutionSource =
  | "official_api"
  | "manual_admin"
  | "community_consensus"
  | "oracle"
  | "creator_verified"
  | "disputed";

// ============================================================================
// Prop Definitions
// ============================================================================

export interface UserProp {
  id: string;
  creatorId: string;
  creatorUsername: string;

  // Content
  title: string;
  description: string;
  category: PropCategory;
  subcategory?: string;
  tags: string[];
  imageUrl?: string;

  // Prop details
  type: PropType;
  outcomes: PropOutcome[];
  status: PropStatus;

  // Resolution
  resolutionCriteria: string;
  resolutionSource: ResolutionSource;
  resolutionSourceUrl?: string;
  resolutionDeadline: Date;
  winningOutcomeId?: string;

  // Timing
  bettingOpens: Date;
  bettingCloses: Date;
  eventTime?: Date;
  settlementTime?: Date;

  // Limits
  minBet: number;
  maxBet: number;
  maxTotalLiquidity: number;
  currentLiquidity: number;

  // Community
  communityVotes: CommunityVote[];
  totalVotes: number;
  approvalPercent: number;
  viewCount: number;
  uniqueBettors: number;

  // Creator economics
  creatorFeePercent: number;
  creatorEarnings: number;
  platformFeePercent: number;

  // Moderation
  moderationStatus: ModerationStatus;
  moderationNotes?: string;
  moderatedBy?: string;
  moderatedAt?: Date;
  flagCount: number;
  flagReasons: string[];

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  settledAt?: Date;
}

export interface PropOutcome {
  id: string;
  propId: string;
  label: string;
  description?: string;
  initialOdds: number;
  currentOdds: number;
  impliedProbability: number;
  totalBets: number;
  totalVolume: number;
  isWinner?: boolean;
}

export interface CommunityVote {
  userId: string;
  vote: "approve" | "reject" | "flag";
  reason?: string;
  votedAt: Date;
}

// ============================================================================
// Prop Bets
// ============================================================================

export interface PropBet {
  id: string;
  propId: string;
  userId: string;
  outcomeId: string;

  // Bet details
  amount: number;
  odds: number;
  potentialPayout: number;
  status: "pending" | "active" | "won" | "lost" | "cancelled" | "refunded";

  // Settlement
  settledAt?: Date;
  payoutAmount?: number;
  creatorFee?: number;
  platformFee?: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Creator Profile
// ============================================================================

export interface PropCreatorProfile {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;

  // Stats
  totalPropsCreated: number;
  activeProps: number;
  settledProps: number;
  approvalRate: number;
  accuracyRate: number;
  totalVolume: number;
  totalEarnings: number;

  // Reputation
  reputationScore: number;
  verifiedCreator: boolean;
  creatorTier: "new" | "bronze" | "silver" | "gold" | "platinum" | "elite";
  badges: CreatorBadge[];

  // Limits
  maxActiveProps: number;
  maxSinglePropLiquidity: number;
  creatorFeeRate: number;

  // History
  joinedAt: Date;
  lastPropCreatedAt?: Date;
}

export interface CreatorBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: Date;
}

// ============================================================================
// Moderation
// ============================================================================

export interface ModerationQueue {
  pendingProps: ModerationItem[];
  flaggedProps: ModerationItem[];
  escalatedProps: ModerationItem[];
  stats: {
    pendingCount: number;
    flaggedCount: number;
    escalatedCount: number;
    averageReviewTime: number;
    approvalRate: number;
  };
}

export interface ModerationItem {
  prop: UserProp;
  submittedAt: Date;
  queuedAt: Date;
  priority: "low" | "normal" | "high" | "urgent";
  assignedTo?: string;
  flags: PropFlag[];
  communityFeedback: CommunityVote[];
}

export interface PropFlag {
  id: string;
  propId: string;
  reporterId: string;
  reason: FlagReason;
  description: string;
  status: "pending" | "reviewed" | "dismissed" | "actioned";
  createdAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
}

export type FlagReason =
  | "inappropriate_content"
  | "misleading"
  | "duplicate"
  | "unresolvable"
  | "market_manipulation"
  | "personal_information"
  | "illegal"
  | "other";

export interface ModerationAction {
  id: string;
  propId: string;
  moderatorId: string;
  action: "approve" | "reject" | "edit" | "pause" | "cancel" | "escalate";
  reason: string;
  previousStatus: PropStatus;
  newStatus: PropStatus;
  changes?: Record<string, unknown>;
  createdAt: Date;
}

// ============================================================================
// Resolution
// ============================================================================

export interface PropResolution {
  id: string;
  propId: string;
  winningOutcomeId: string;
  source: ResolutionSource;
  evidence: ResolutionEvidence[];
  resolvedBy: string;
  resolvedAt: Date;
  disputeWindow: Date;
  finalizedAt?: Date;
  disputeCount: number;
}

export interface ResolutionEvidence {
  type: "url" | "screenshot" | "api_data" | "document";
  source: string;
  data: string;
  verifiedAt: Date;
  verifiedBy?: string;
}

export interface PropDispute {
  id: string;
  propId: string;
  resolutionId: string;
  disputerId: string;
  claimedOutcomeId: string;
  reason: string;
  evidence: ResolutionEvidence[];
  status: "pending" | "reviewing" | "upheld" | "overturned" | "dismissed";
  reviewNotes?: string;
  reviewedBy?: string;
  createdAt: Date;
  resolvedAt?: Date;
}

// ============================================================================
// Service Types
// ============================================================================

export interface CreatePropParams {
  creatorId: string;
  title: string;
  description: string;
  category: PropCategory;
  subcategory?: string;
  tags?: string[];
  type: PropType;
  outcomes: {
    label: string;
    description?: string;
    initialOdds: number;
  }[];
  resolutionCriteria: string;
  resolutionSource: ResolutionSource;
  resolutionSourceUrl?: string;
  resolutionDeadline: Date;
  bettingOpens: Date;
  bettingCloses: Date;
  eventTime?: Date;
  minBet?: number;
  maxBet?: number;
  maxTotalLiquidity?: number;
  imageUrl?: string;
}

export interface UpdatePropParams {
  propId: string;
  title?: string;
  description?: string;
  tags?: string[];
  imageUrl?: string;
  resolutionCriteria?: string;
  bettingCloses?: Date;
  maxBet?: number;
  maxTotalLiquidity?: number;
}

export interface PlacePropBetParams {
  userId: string;
  propId: string;
  outcomeId: string;
  amount: number;
}

export interface VoteOnPropParams {
  userId: string;
  propId: string;
  vote: "approve" | "reject" | "flag";
  reason?: string;
}

export interface ModeratePropParams {
  moderatorId: string;
  propId: string;
  action: "approve" | "reject" | "edit" | "pause" | "cancel" | "escalate";
  reason: string;
  changes?: Record<string, unknown>;
}

export interface ResolvePropParams {
  propId: string;
  winningOutcomeId: string;
  source: ResolutionSource;
  evidence: {
    type: "url" | "screenshot" | "api_data" | "document";
    source: string;
    data: string;
  }[];
  resolvedBy: string;
}

export interface DisputeResolutionParams {
  userId: string;
  propId: string;
  claimedOutcomeId: string;
  reason: string;
  evidence: {
    type: "url" | "screenshot" | "api_data" | "document";
    source: string;
    data: string;
  }[];
}

export interface GetPropsParams {
  category?: PropCategory;
  status?: PropStatus;
  creatorId?: string;
  search?: string;
  sortBy?: "popular" | "newest" | "closing_soon" | "volume";
  limit?: number;
  offset?: number;
}

// ============================================================================
// Configuration
// ============================================================================

export const PROP_CREATOR_TIERS = {
  new: {
    maxActiveProps: 3,
    maxSinglePropLiquidity: 1000,
    creatorFeeRate: 0.01,
    requiredReputation: 0,
  },
  bronze: {
    maxActiveProps: 5,
    maxSinglePropLiquidity: 5000,
    creatorFeeRate: 0.015,
    requiredReputation: 100,
  },
  silver: {
    maxActiveProps: 10,
    maxSinglePropLiquidity: 10000,
    creatorFeeRate: 0.02,
    requiredReputation: 500,
  },
  gold: {
    maxActiveProps: 20,
    maxSinglePropLiquidity: 25000,
    creatorFeeRate: 0.025,
    requiredReputation: 1000,
  },
  platinum: {
    maxActiveProps: 50,
    maxSinglePropLiquidity: 50000,
    creatorFeeRate: 0.03,
    requiredReputation: 5000,
  },
  elite: {
    maxActiveProps: 100,
    maxSinglePropLiquidity: 100000,
    creatorFeeRate: 0.04,
    requiredReputation: 10000,
  },
};

export const PROP_DEFAULTS = {
  minBet: 1,
  maxBet: 500,
  maxTotalLiquidity: 10000,
  platformFeePercent: 0.05,
  disputeWindowHours: 24,
  minVotesForApproval: 10,
  approvalThreshold: 0.6,
};
