import type {
  SelfExclusion,
  DepositLimit,
  SessionLimit,
  GeoCheck,
  AuditLog,
  ResponsibleGamingSettings,
  CoolOffPeriod,
  OddsExplanation,
  VerificationBadge,
  ComplianceConfig,
} from './types';

/**
 * ComplianceService - Responsible gaming and regulatory compliance
 * Manages geofencing, self-exclusion, limits, and audit trails
 */
export class ComplianceService {
  private static instance: ComplianceService;
  private config: ComplianceConfig;

  private constructor(config: Partial<ComplianceConfig> = {}) {
    this.config = {
      allowedCountries: config.allowedCountries ?? ['US', 'CA'],
      allowedStates: config.allowedStates ?? [], // State-by-state for US
      defaultDepositLimitDaily: config.defaultDepositLimitDaily ?? 1000,
      defaultSessionLimitMinutes: config.defaultSessionLimitMinutes ?? 180,
      minAgeYears: config.minAgeYears ?? 21,
      kycRequired: config.kycRequired ?? true,
    };
  }

  static getInstance(config?: Partial<ComplianceConfig>): ComplianceService {
    if (!ComplianceService.instance) {
      ComplianceService.instance = new ComplianceService(config);
    }
    return ComplianceService.instance;
  }

  async checkGeofence(userId: string, ipAddress: string): Promise<GeoCheck> {
    // TODO: Verify user location is in allowed jurisdiction
    // 1. GeoIP lookup
    // 2. Check against allowed countries/states
    // 3. Log check
    // 4. Return allowed/denied

    return {
      checkId: crypto.randomUUID(),
      userId,
      ipAddress,
      country: 'US',
      allowed: false,
      timestamp: new Date(),
    };
  }

  async createSelfExclusion(userId: string, durationDays: number | 'permanent'): Promise<SelfExclusion> {
    // TODO: Self-exclude user from platform
    // 1. Create exclusion record
    // 2. Block all gaming activities
    // 3. Send confirmation email
    // 4. Log action

    const startDate = new Date();
    const endDate = durationDays === 'permanent' 
      ? new Date('2099-12-31') 
      : new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    return {
      exclusionId: crypto.randomUUID(),
      userId,
      startDate,
      endDate,
      type: durationDays === 'permanent' ? 'permanent' : 'temporary',
      status: 'active',
      createdAt: new Date(),
    };
  }

  async setDepositLimit(userId: string, limitType: DepositLimit['limitType'], amount: number): Promise<DepositLimit> {
    // TODO: Set deposit limit for user
    // 1. Create/update limit
    // 2. Enforce on future deposits
    // 3. Notify user

    const now = new Date();
    const periodEnd = this.calculatePeriodEnd(now, limitType);

    return {
      limitId: crypto.randomUUID(),
      userId,
      limitType,
      amount,
      currentSpent: 0,
      periodStart: now,
      periodEnd,
      status: 'active',
      createdAt: new Date(),
    };
  }

  async setSessionLimit(userId: string, maxDurationMinutes: number): Promise<SessionLimit> {
    // TODO: Set session time limit
    // 1. Create limit
    // 2. Track session duration
    // 3. Warn at threshold
    // 4. Force logout at limit

    return {
      limitId: crypto.randomUUID(),
      userId,
      maxDurationMinutes,
      warningThresholdMinutes: maxDurationMinutes * 0.8,
      status: 'active',
      createdAt: new Date(),
    };
  }

  async startCoolOffPeriod(userId: string, durationHours: number): Promise<CoolOffPeriod> {
    // TODO: Start cool-off period (temporary pause)
    // Less severe than self-exclusion, just a break

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);

    return {
      periodId: crypto.randomUUID(),
      userId,
      startDate,
      endDate,
      durationHours,
      status: 'active',
    };
  }

  async getResponsibleGamingSettings(userId: string): Promise<ResponsibleGamingSettings> {
    // TODO: Get all responsible gaming settings for user
    return {
      userId,
      depositLimits: [],
      sessionLimits: [],
      selfExclusions: [],
      coolOffPeriods: [],
      realityChecksEnabled: false,
      realityCheckIntervalMinutes: 60,
    };
  }

  async createAuditLog(
    entityType: AuditLog['entityType'],
    entityId: string,
    action: string,
    userId?: string,
    before?: unknown,
    after?: unknown
  ): Promise<AuditLog> {
    // TODO: Create audit trail entry
    // All market settlements, trades, etc. should be logged

    return {
      logId: crypto.randomUUID(),
      entityType,
      entityId,
      action,
      userId,
      before,
      after,
      timestamp: new Date(),
    };
  }

  async getAuditLog(entityType: string, entityId: string): Promise<AuditLog[]> {
    // TODO: Retrieve complete audit trail for entity
    return [];
  }

  async explainOdds(marketId: string): Promise<OddsExplanation> {
    // TODO: Explain how LMSR odds are calculated
    // Transparency for users to understand market mechanics

    return {
      marketId,
      currentOdds: 0,
      lmsrParams: {
        liquidity: 0,
        yesShares: 0,
        noShares: 0,
      },
      calculation: 'Pending implementation',
      lastUpdated: new Date(),
    };
  }

  async verifyAge(userId: string, dateOfBirth: Date): Promise<boolean> {
    // TODO: Verify user is old enough
    const age = this.calculateAge(dateOfBirth);
    return age >= this.config.minAgeYears;
  }

  private calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    let age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
      age--;
    }
    return age;
  }

  private calculatePeriodEnd(start: Date, limitType: DepositLimit['limitType']): Date {
    const end = new Date(start);
    switch (limitType) {
      case 'daily':
        end.setDate(end.getDate() + 1);
        break;
      case 'weekly':
        end.setDate(end.getDate() + 7);
        break;
      case 'monthly':
        end.setMonth(end.getMonth() + 1);
        break;
    }
    return end;
  }
}

export const complianceService = ComplianceService.getInstance();
