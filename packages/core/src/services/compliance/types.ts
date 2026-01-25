/**
 * Compliance & Trust Features
 * Responsible gaming, geofencing, and audit trails
 */

export interface SelfExclusion {
  exclusionId: string;
  userId: string;
  startDate: Date;
  endDate: Date;
  type: 'temporary' | 'permanent';
  reason?: string;
  status: 'active' | 'expired' | 'revoked';
  createdAt: Date;
}

export interface DepositLimit {
  limitId: string;
  userId: string;
  limitType: 'daily' | 'weekly' | 'monthly';
  amount: number;
  currentSpent: number;
  periodStart: Date;
  periodEnd: Date;
  status: 'active' | 'paused';
  createdAt: Date;
}

export interface SessionLimit {
  limitId: string;
  userId: string;
  maxDurationMinutes: number;
  currentSessionStart?: Date;
  warningThresholdMinutes: number;
  status: 'active' | 'paused';
  createdAt: Date;
}

export interface GeoCheck {
  checkId: string;
  userId: string;
  ipAddressHash: string; // Hashed for privacy
  country: string;
  state?: string;
  city?: string;
  allowed: boolean;
  reason?: string;
  timestamp: Date;
}

export interface AuditLog {
  logId: string;
  entityType: 'market' | 'trade' | 'transaction' | 'settlement';
  entityId: string;
  action: string;
  userId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface ResponsibleGamingSettings {
  userId: string;
  depositLimits: DepositLimit[];
  sessionLimits: SessionLimit[];
  selfExclusions: SelfExclusion[];
  coolOffPeriods: CoolOffPeriod[];
  realityChecksEnabled: boolean;
  realityCheckIntervalMinutes: number;
}

export interface CoolOffPeriod {
  periodId: string;
  userId: string;
  startDate: Date;
  endDate: Date;
  durationHours: number;
  status: 'active' | 'completed' | 'cancelled';
}

export interface OddsExplanation {
  marketId: string;
  currentOdds: number;
  lmsrParams: {
    liquidity: number;
    yesShares: number;
    noShares: number;
  };
  calculation: string;
  lastUpdated: Date;
}

export interface VerificationBadge {
  marketId: string;
  verifiedBy: 'chainlink' | 'espn' | 'nfl' | 'official';
  verificationDate: Date;
  status: 'verified' | 'pending' | 'disputed';
}

export interface ComplianceConfig {
  allowedCountries: string[];
  allowedStates: string[]; // US states
  defaultDepositLimitDaily: number;
  defaultSessionLimitMinutes: number;
  minAgeYears: number;
  kycRequired: boolean;
}
