/**
 * PULL Super App - Shared TypeScript Types
 *
 * This package exports all shared types used across the PULL monorepo.
 * Import specific types from their modules or use the barrel export.
 *
 * @example
 * import { User, Order, PredictionEvent } from "@pull/types";
 * import type { ApiResponse, PaginatedResponse } from "@pull/types/api";
 */

// User types
export type {
  User,
  UserProfile,
  UserBalance,
  UserPosition,
  UserPreferences,
  UserSession,
  NotificationSettings,
  PrivacySettings,
  TradingPreferences,
  SocialLinks,
  KYCStatus,
  KYCTier,
  UserStatus,
  AuthProvider,
  IncomeRange,
  InvestmentExperience,
  RiskTolerance,
  InvestmentObjective,
  AssetType,
} from "./user";

// Trading types
export type {
  Order,
  Trade,
  Fill,
  Position,
  Market,
  Orderbook,
  OrderbookLevel,
  PredictionEvent,
  PredictionOutcome,
  PredictionPosition,
  PriceAlert,
  OrderType,
  OrderSide,
  OrderStatus,
  TimeInForce,
  AssetClass,
  MarketStatus,
  PredictionEventStatus,
  PredictionCategory,
} from "./trading";

// RWA types
export type {
  RWAAsset,
  PokemonCard,
  GradingInfo,
  GradingSubgrades,
  GradingPopulation,
  AssetListing,
  FractionalShare,
  OwnershipHistoryEntry,
  AssetPriceHistory,
  AssetOffer,
  RWAAssetType,
  RWAAssetStatus,
  GradingCompany,
  PokemonRarity,
  PokemonEdition,
  ListingType,
  ListingStatus,
} from "./rwa";

// Messaging types
export type {
  MatrixRoom,
  MatrixMessage,
  MatrixUser,
  MessageContent,
  TextContent,
  ImageContent,
  VideoContent,
  FileContent,
  AudioContent,
  LocationContent,
  PollContent,
  TradeShareContent,
  PositionShareContent,
  MessageReaction,
  RoomMember,
  ChatRoom,
  ChatRoomMember,
  ChatMessage,
  DirectMessage,
  TypingIndicator,
  ReadReceipt,
  PollOption,
  MatrixRoomType,
  MatrixMembership,
  MessageContentType,
} from "./messaging";

// Email types
export type {
  Email,
  EmailAccount,
  EmailThread,
  EmailFolder,
  EmailTriage,
  EmailParticipant,
  EmailAttachment,
  SmartReply,
  EmailExtractedData,
  OrderConfirmation,
  MeetingRequest,
  FlightInfo,
  TrackingInfo,
  InvoiceInfo,
  SubscriptionInfo,
  EmailSearchQuery,
  EmailSendRequest,
  EmailAttachmentUpload,
  TriageEntity,
  FlightLocation,
  EmailPriority,
  EmailCategory,
  EmailStatus,
  EmailSyncStatus,
  EmailProvider,
  EmailSentiment,
  TriageAction,
} from "./email";

// Rewards types
export type {
  PointsTransaction,
  PointsBalance,
  Reward,
  Redemption,
  Sweepstakes,
  SweepstakesEntry,
  SweepstakesPrize,
  SweepstakesWinner,
  TokenBalance,
  TokenTransaction,
  StakingPosition,
  StakingPool,
  VestingSchedule,
  VestingMilestone,
  Achievement,
  UserAchievement,
  AchievementRequirement,
  Leaderboard,
  LeaderboardEntry,
  TierConfig,
  TierBenefit,
  ShippingAddress,
  FulfillmentDetails,
  RewardTier,
  RewardCategory,
  RewardType,
  PointsTransactionType,
  PointsTransactionStatus,
  RedemptionStatus,
  FulfillmentType,
  TokenTransactionType,
  AchievementCategory,
} from "./rewards";

// API types
export type {
  ApiResponse,
  PaginatedResponse,
  CursorPaginatedResponse,
  ErrorResponse,
  ApiError,
  ValidationError,
  BatchRequest,
  BatchOperation,
  BatchResponse,
  BatchResult,
  BatchSummary,
  WebhookPayload,
  HealthCheckResponse,
  HealthCheck,
  RequestContext,
  AuditLogEntry,
  SortOptions,
  FilterOptions,
  QueryParams,
  SubscriptionMessage,
  ResponseMeta,
  RateLimitInfo,
  PaginationInfo,
  CursorInfo,
  ErrorCode,
  WebhookEventType,
  FilterOperator,
  SubscriptionChannel,
} from "./api";

// Real Estate Prediction Market types
export type {
  // Market types
  RealEstatePredictionEvent,
  RealEstateMarketDataPoint,
  RealEstatePredictionPosition,
  RealEstateMarketCategory,
  RealEstateMarketStatus,
  GeographicScope,
  // Brokerage & Agent types
  Brokerage,
  RealEstateAgent,
  AgentPerformanceSnapshot,
  BrokerageStatus,
  BrokerageTier,
  AgentStatus,
  AgentSpecialization,
  // Referral types
  AgentReferral,
  AgentPointsTransaction,
  AgentPointsTransactionType,
  ReferralStatus,
  // Market sentiment types
  MarketSentiment,
  AgentMarketInsight,
  CommissionPredictionMarket,
  // PULL Index types
  PullRealEstateIndex,
  PullRealEstateIndexComponent,
  PullRealEstateIndexHistorical,
  // Content types
  MarketPredictionNewsletter,
  NewsletterPrediction,
  MarketHighlight,
  // White-label types
  WhiteLabelConfig,
  WhiteLabelFeature,
  // Lead qualification types
  TradingBehaviorLeadScore,
  // API request types
  CreateRealEstateMarketRequest,
  CreateBrokerageRequest,
  RegisterAgentRequest,
  AgentInviteClientRequest,
  GetMarketSentimentRequest,
  GetPullIndexRequest,
} from "./realEstate";
