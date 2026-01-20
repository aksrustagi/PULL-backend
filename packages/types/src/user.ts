/**
 * User Types for PULL Super App
 * Covers user profiles, KYC status, balances, and preferences
 */

/** KYC verification status */
export type KYCStatus =
  | "pending"
  | "email_verified"
  | "identity_pending"
  | "identity_verified"
  | "background_pending"
  | "background_cleared"
  | "approved"
  | "rejected"
  | "suspended";

/** KYC tier levels determining feature access */
export type KYCTier = "none" | "basic" | "verified" | "premium" | "institutional";

/** User account status */
export type UserStatus = "active" | "inactive" | "suspended" | "closed";

/** Authentication provider types */
export type AuthProvider = "email" | "google" | "apple" | "wallet";

/** Base user interface */
export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  phone?: string;
  phoneVerified: boolean;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  status: UserStatus;
  kycStatus: KYCStatus;
  kycTier: KYCTier;
  authProvider: AuthProvider;
  walletAddress?: string;
  referralCode: string;
  referredBy?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

/** Extended user profile with additional details */
export interface UserProfile extends User {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
  country?: string;
  state?: string;
  city?: string;
  postalCode?: string;
  addressLine1?: string;
  addressLine2?: string;
  taxId?: string;
  taxCountry?: string;
  occupation?: string;
  employerName?: string;
  incomeRange?: IncomeRange;
  investmentExperience?: InvestmentExperience;
  riskTolerance?: RiskTolerance;
  investmentObjectives?: InvestmentObjective[];
  bio?: string;
  socialLinks?: SocialLinks;
}

/** Income range for suitability */
export type IncomeRange =
  | "under_25k"
  | "25k_50k"
  | "50k_100k"
  | "100k_200k"
  | "200k_500k"
  | "500k_1m"
  | "over_1m";

/** Investment experience levels */
export type InvestmentExperience = "none" | "limited" | "moderate" | "extensive" | "professional";

/** Risk tolerance levels */
export type RiskTolerance = "conservative" | "moderate" | "aggressive" | "speculative";

/** Investment objectives */
export type InvestmentObjective =
  | "capital_preservation"
  | "income"
  | "growth"
  | "speculation"
  | "hedging";

/** Social media links */
export interface SocialLinks {
  twitter?: string;
  discord?: string;
  telegram?: string;
  website?: string;
}

/** User balance by asset type */
export interface UserBalance {
  userId: string;
  assetType: AssetType;
  assetId: string;
  available: number;
  held: number;
  pending: number;
  total: number;
  currency: string;
  updatedAt: Date;
}

/** Asset types in the platform */
export type AssetType =
  | "usd"
  | "crypto"
  | "prediction"
  | "rwa"
  | "points"
  | "token";

/** User position summary */
export interface UserPosition {
  userId: string;
  assetType: AssetType;
  assetId: string;
  symbol: string;
  quantity: number;
  averageCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  realizedPnL: number;
  openedAt: Date;
  updatedAt: Date;
}

/** User preferences */
export interface UserPreferences {
  userId: string;
  theme: "light" | "dark" | "system";
  language: string;
  timezone: string;
  currency: string;
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  trading: TradingPreferences;
  updatedAt: Date;
}

/** Notification settings */
export interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
  orderFills: boolean;
  orderCancellations: boolean;
  priceAlerts: boolean;
  marketNews: boolean;
  accountAlerts: boolean;
  promotions: boolean;
  weeklyDigest: boolean;
}

/** Privacy settings */
export interface PrivacySettings {
  showProfile: boolean;
  showPositions: boolean;
  showActivity: boolean;
  allowDiscovery: boolean;
}

/** Trading preferences */
export interface TradingPreferences {
  defaultOrderType: "market" | "limit";
  confirmOrders: boolean;
  showPnL: boolean;
  displayCurrency: string;
}

/** Session information */
export interface UserSession {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceType: "web" | "ios" | "android" | "desktop";
  ipAddress: string;
  userAgent: string;
  location?: string;
  createdAt: Date;
  expiresAt: Date;
  lastActiveAt: Date;
}
