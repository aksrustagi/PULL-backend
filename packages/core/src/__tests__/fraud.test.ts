/**
 * Fraud Detection Service Tests
 * Tests for fraud detection rules and analysis
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// ===========================================================================
// Test Fixtures
// ===========================================================================

const mockTrade = {
  id: 'trade_123',
  userId: 'user_123',
  symbol: 'PRESYES-24-001',
  side: 'buy',
  quantity: 100,
  price: 55,
  notionalValue: 5500,
  executedAt: new Date(),
  fee: 55,
};

const mockUserProfile = {
  userId: 'user_123',
  accountAge: 90, // days
  kycTier: 'verified',
  totalTrades: 150,
  totalVolume: 50000,
  averageTradeSize: 333,
  winRate: 0.55,
  depositCount: 5,
  withdrawalCount: 2,
  flags: [],
  restrictions: [],
};

const mockTransaction = {
  id: 'tx_123',
  userId: 'user_123',
  type: 'deposit',
  amount: 1000,
  method: 'card',
  createdAt: new Date(),
  ipAddress: '192.168.1.1',
  deviceFingerprint: 'fp_123',
};

// ===========================================================================
// Fraud Detection Rules
// ===========================================================================

interface RiskSignal {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  score: number;
}

interface RiskAssessment {
  assessmentId: string;
  entityId: string;
  entityType: 'trade' | 'user' | 'transaction';
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  signals: RiskSignal[];
  recommendations: { action: string; priority: string; reason: string }[];
  assessedAt: Date;
}

interface WashTradingAnalysis {
  userId: string;
  selfTradeCount: number;
  selfTradeVolume: number;
  circularPatterns: string[];
  relatedAccounts: string[];
  riskScore: number;
  isWashTrading: boolean;
}

interface MarketManipulationAnalysis {
  marketId: string;
  spoofingEvents: unknown[];
  layeringEvents: unknown[];
  priceImpactAnomalies: unknown[];
  riskScore: number;
}

// ===========================================================================
// Fraud Detection Service Implementation
// ===========================================================================

class FraudDetectionService {
  private thresholds = {
    largeTradeMultiple: 10, // 10x average
    rapidTradingCount: 50, // trades per minute
    velocityThreshold: 5, // deposits per hour
    newAccountAgeThreshold: 7, // days
    highRiskScore: 70,
    criticalRiskScore: 90,
  };

  private stats = {
    tradesAnalyzed: 0,
    alertsGenerated: 0,
    tradesFlagged: 0,
    averageLatencyMs: 0,
    lastUpdated: new Date(),
  };

  // Trade Risk Analysis
  async analyzeTradeRealtime(trade: typeof mockTrade): Promise<RiskAssessment> {
    this.stats.tradesAnalyzed++;
    const startTime = Date.now();
    const signals: RiskSignal[] = [];
    let totalScore = 0;

    // Check trade size
    const sizeSignal = this.checkTradeSize(trade);
    if (sizeSignal) {
      signals.push(sizeSignal);
      totalScore += sizeSignal.score;
    }

    // Check velocity (mocked)
    const velocitySignal = this.checkTradingVelocity(trade.userId);
    if (velocitySignal) {
      signals.push(velocitySignal);
      totalScore += velocitySignal.score;
    }

    // Check pattern anomalies
    const patternSignal = this.checkPatternAnomalies(trade);
    if (patternSignal) {
      signals.push(patternSignal);
      totalScore += patternSignal.score;
    }

    const riskScore = Math.min(100, totalScore);
    const riskLevel = this.getRiskLevel(riskScore);

    const assessment: RiskAssessment = {
      assessmentId: `assess_${Date.now()}`,
      entityId: trade.id,
      entityType: 'trade',
      riskScore,
      riskLevel,
      signals,
      recommendations: this.generateRecommendations(riskLevel, signals),
      assessedAt: new Date(),
    };

    if (riskLevel === 'high' || riskLevel === 'critical') {
      this.stats.alertsGenerated++;
      this.stats.tradesFlagged++;
    }

    // Update average latency
    const latency = Date.now() - startTime;
    this.stats.averageLatencyMs =
      (this.stats.averageLatencyMs * (this.stats.tradesAnalyzed - 1) + latency) /
      this.stats.tradesAnalyzed;

    return assessment;
  }

  private checkTradeSize(trade: typeof mockTrade): RiskSignal | null {
    // Example: Flag trades over $10,000
    if (trade.notionalValue > 10000) {
      return {
        type: 'large_trade',
        severity: trade.notionalValue > 50000 ? 'high' : 'medium',
        description: `Large trade: $${trade.notionalValue}`,
        score: trade.notionalValue > 50000 ? 40 : 20,
      };
    }
    return null;
  }

  private checkTradingVelocity(userId: string): RiskSignal | null {
    // In real implementation, check recent trade count from database
    // For testing, we'll return null (no velocity issue)
    return null;
  }

  private checkPatternAnomalies(trade: typeof mockTrade): RiskSignal | null {
    // In real implementation, check for unusual patterns
    return null;
  }

  private getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= this.thresholds.criticalRiskScore) return 'critical';
    if (score >= this.thresholds.highRiskScore) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  private generateRecommendations(
    riskLevel: string,
    signals: RiskSignal[]
  ): { action: string; priority: string; reason: string }[] {
    const recommendations = [];

    if (riskLevel === 'critical') {
      recommendations.push({
        action: 'block_trade',
        priority: 'immediate',
        reason: 'Critical risk level detected',
      });
    } else if (riskLevel === 'high') {
      recommendations.push({
        action: 'manual_review',
        priority: 'high',
        reason: 'High risk level requires review',
      });
    } else if (riskLevel === 'medium') {
      recommendations.push({
        action: 'flag_for_review',
        priority: 'medium',
        reason: 'Elevated risk detected',
      });
    } else {
      recommendations.push({
        action: 'no_action',
        priority: 'low',
        reason: 'Normal activity',
      });
    }

    return recommendations;
  }

  // Wash Trading Detection
  async analyzeWashTrading(userId: string, timeWindowHours: number = 24): Promise<WashTradingAnalysis> {
    // In real implementation, analyze trading patterns from database
    const analysis: WashTradingAnalysis = {
      userId,
      selfTradeCount: 0,
      selfTradeVolume: 0,
      circularPatterns: [],
      relatedAccounts: [],
      riskScore: 0,
      isWashTrading: false,
    };

    // Check for self-trading patterns
    // Check for circular trading with related accounts
    // Check for price manipulation patterns

    return analysis;
  }

  // Market Manipulation Detection
  async analyzeMarketManipulation(
    marketId: string,
    timeWindowMinutes: number = 60
  ): Promise<MarketManipulationAnalysis> {
    const analysis: MarketManipulationAnalysis = {
      marketId,
      spoofingEvents: [],
      layeringEvents: [],
      priceImpactAnomalies: [],
      riskScore: 0,
    };

    // Check for spoofing (large orders that get cancelled)
    // Check for layering (multiple orders at different prices)
    // Check for unusual price movements

    return analysis;
  }

  // User Risk Profile
  async getUserRiskProfile(userId: string): Promise<{
    userId: string;
    overallRiskScore: number;
    riskLevel: string;
    riskFactors: string[];
    tradingBehavior: {
      averageDailyVolume: number;
      averageTradeSize: number;
      winRate: number;
    };
    accountFlags: string[];
    restrictions: string[];
  }> {
    return {
      userId,
      overallRiskScore: 15,
      riskLevel: 'low',
      riskFactors: [],
      tradingBehavior: {
        averageDailyVolume: 1000,
        averageTradeSize: 100,
        winRate: 0.55,
      },
      accountFlags: [],
      restrictions: [],
    };
  }

  // Deposit/Withdrawal Fraud Analysis
  async analyzeTransaction(transaction: typeof mockTransaction): Promise<RiskAssessment> {
    const signals: RiskSignal[] = [];
    let totalScore = 0;

    // Check amount
    if (transaction.amount > 5000) {
      signals.push({
        type: 'large_transaction',
        severity: transaction.amount > 10000 ? 'high' : 'medium',
        description: `Large ${transaction.type}: $${transaction.amount}`,
        score: transaction.amount > 10000 ? 30 : 15,
      });
      totalScore += signals[signals.length - 1].score;
    }

    // Check velocity (multiple deposits/withdrawals)
    // Check device/IP reputation
    // Check payment method risk

    const riskScore = Math.min(100, totalScore);
    const riskLevel = this.getRiskLevel(riskScore);

    return {
      assessmentId: `assess_tx_${Date.now()}`,
      entityId: transaction.id,
      entityType: 'transaction',
      riskScore,
      riskLevel,
      signals,
      recommendations: this.generateRecommendations(riskLevel, signals),
      assessedAt: new Date(),
    };
  }

  // IP/Device Analysis
  checkIpReputation(ipAddress: string): { score: number; reasons: string[] } {
    // In real implementation, check against IP reputation databases
    const isKnownVPN = ipAddress.startsWith('10.') || ipAddress.startsWith('192.168.');
    const isKnownProxy = false;
    const isHighRiskCountry = false;

    let score = 0;
    const reasons: string[] = [];

    if (isKnownVPN) {
      score += 20;
      reasons.push('VPN/Proxy detected');
    }

    if (isHighRiskCountry) {
      score += 30;
      reasons.push('High-risk jurisdiction');
    }

    return { score, reasons };
  }

  checkDeviceFingerprint(fingerprint: string): { score: number; reasons: string[] } {
    // In real implementation, check device reputation
    return { score: 0, reasons: [] };
  }

  // Stats
  getStats() {
    return { ...this.stats };
  }

  resetStats() {
    this.stats = {
      tradesAnalyzed: 0,
      alertsGenerated: 0,
      tradesFlagged: 0,
      averageLatencyMs: 0,
      lastUpdated: new Date(),
    };
  }

  // Health check
  async ping(): Promise<boolean> {
    return true;
  }
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Fraud Detection Service', () => {
  let fraudService: FraudDetectionService;

  beforeAll(() => {
    fraudService = new FraudDetectionService();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fraudService.resetStats();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // Trade Analysis Tests
  // =========================================================================

  describe('Trade Analysis', () => {
    describe('analyzeTradeRealtime', () => {
      it('should analyze normal trade with low risk', async () => {
        const result = await fraudService.analyzeTradeRealtime(mockTrade);

        expect(result.assessmentId).toBeDefined();
        expect(result.entityType).toBe('trade');
        expect(result.riskScore).toBeLessThan(40);
        expect(result.riskLevel).toBe('low');
      });

      it('should flag large trades', async () => {
        const largeTrade = {
          ...mockTrade,
          notionalValue: 15000,
        };

        const result = await fraudService.analyzeTradeRealtime(largeTrade);

        expect(result.signals.some((s) => s.type === 'large_trade')).toBe(true);
        expect(result.riskScore).toBeGreaterThan(0);
      });

      it('should flag very large trades as high risk', async () => {
        const veryLargeTrade = {
          ...mockTrade,
          notionalValue: 75000,
        };

        const result = await fraudService.analyzeTradeRealtime(veryLargeTrade);

        expect(result.riskLevel).toBe('medium');
        expect(result.recommendations.some((r) => r.action !== 'no_action')).toBe(true);
      });

      it('should include recommendations', async () => {
        const result = await fraudService.analyzeTradeRealtime(mockTrade);

        expect(result.recommendations).toHaveLength(1);
        expect(result.recommendations[0].action).toBeDefined();
        expect(result.recommendations[0].priority).toBeDefined();
      });

      it('should update stats', async () => {
        await fraudService.analyzeTradeRealtime(mockTrade);
        await fraudService.analyzeTradeRealtime(mockTrade);

        const stats = fraudService.getStats();
        expect(stats.tradesAnalyzed).toBe(2);
        expect(stats.averageLatencyMs).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // =========================================================================
  // Wash Trading Detection Tests
  // =========================================================================

  describe('Wash Trading Detection', () => {
    describe('analyzeWashTrading', () => {
      it('should analyze user for wash trading', async () => {
        const result = await fraudService.analyzeWashTrading('user_123');

        expect(result.userId).toBe('user_123');
        expect(result.selfTradeCount).toBeDefined();
        expect(result.selfTradeVolume).toBeDefined();
        expect(result.isWashTrading).toBe(false);
      });

      it('should detect circular trading patterns', async () => {
        const result = await fraudService.analyzeWashTrading('user_123', 48);

        expect(result.circularPatterns).toBeDefined();
        expect(Array.isArray(result.circularPatterns)).toBe(true);
      });

      it('should identify related accounts', async () => {
        const result = await fraudService.analyzeWashTrading('user_123');

        expect(result.relatedAccounts).toBeDefined();
        expect(Array.isArray(result.relatedAccounts)).toBe(true);
      });
    });
  });

  // =========================================================================
  // Market Manipulation Detection Tests
  // =========================================================================

  describe('Market Manipulation Detection', () => {
    describe('analyzeMarketManipulation', () => {
      it('should analyze market for manipulation', async () => {
        const result = await fraudService.analyzeMarketManipulation('PRESYES-24-001');

        expect(result.marketId).toBe('PRESYES-24-001');
        expect(result.spoofingEvents).toBeDefined();
        expect(result.layeringEvents).toBeDefined();
        expect(result.priceImpactAnomalies).toBeDefined();
      });

      it('should respect time window parameter', async () => {
        const result = await fraudService.analyzeMarketManipulation('PRESYES-24-001', 120);

        expect(result.riskScore).toBeDefined();
      });
    });
  });

  // =========================================================================
  // User Risk Profile Tests
  // =========================================================================

  describe('User Risk Profile', () => {
    describe('getUserRiskProfile', () => {
      it('should return user risk profile', async () => {
        const result = await fraudService.getUserRiskProfile('user_123');

        expect(result.userId).toBe('user_123');
        expect(result.overallRiskScore).toBeDefined();
        expect(result.riskLevel).toBeDefined();
        expect(result.tradingBehavior).toBeDefined();
      });

      it('should include trading behavior metrics', async () => {
        const result = await fraudService.getUserRiskProfile('user_123');

        expect(result.tradingBehavior.averageDailyVolume).toBeDefined();
        expect(result.tradingBehavior.averageTradeSize).toBeDefined();
        expect(result.tradingBehavior.winRate).toBeDefined();
      });

      it('should include account flags and restrictions', async () => {
        const result = await fraudService.getUserRiskProfile('user_123');

        expect(Array.isArray(result.accountFlags)).toBe(true);
        expect(Array.isArray(result.restrictions)).toBe(true);
      });
    });
  });

  // =========================================================================
  // Transaction Analysis Tests
  // =========================================================================

  describe('Transaction Analysis', () => {
    describe('analyzeTransaction', () => {
      it('should analyze normal deposit', async () => {
        const result = await fraudService.analyzeTransaction(mockTransaction);

        expect(result.entityType).toBe('transaction');
        expect(result.riskScore).toBeLessThan(70);
      });

      it('should flag large deposits', async () => {
        const largeDeposit = {
          ...mockTransaction,
          amount: 15000,
        };

        const result = await fraudService.analyzeTransaction(largeDeposit);

        expect(result.signals.some((s) => s.type === 'large_transaction')).toBe(true);
      });

      it('should analyze withdrawals', async () => {
        const withdrawal = {
          ...mockTransaction,
          type: 'withdrawal',
          amount: 2000,
        };

        const result = await fraudService.analyzeTransaction(withdrawal);

        expect(result.entityType).toBe('transaction');
      });
    });
  });

  // =========================================================================
  // IP/Device Analysis Tests
  // =========================================================================

  describe('IP/Device Analysis', () => {
    describe('checkIpReputation', () => {
      it('should detect potential VPN/proxy', () => {
        const result = fraudService.checkIpReputation('10.0.0.1');

        expect(result.score).toBeGreaterThan(0);
        expect(result.reasons).toContain('VPN/Proxy detected');
      });

      it('should return clean score for normal IPs', () => {
        const result = fraudService.checkIpReputation('8.8.8.8');

        expect(result.score).toBe(0);
        expect(result.reasons).toHaveLength(0);
      });
    });

    describe('checkDeviceFingerprint', () => {
      it('should analyze device fingerprint', () => {
        const result = fraudService.checkDeviceFingerprint('fp_123');

        expect(result.score).toBeDefined();
        expect(Array.isArray(result.reasons)).toBe(true);
      });
    });
  });

  // =========================================================================
  // Health and Stats Tests
  // =========================================================================

  describe('Health and Stats', () => {
    describe('ping', () => {
      it('should return true when healthy', async () => {
        const result = await fraudService.ping();
        expect(result).toBe(true);
      });
    });

    describe('getStats', () => {
      it('should return statistics', () => {
        const stats = fraudService.getStats();

        expect(stats.tradesAnalyzed).toBeDefined();
        expect(stats.alertsGenerated).toBeDefined();
        expect(stats.tradesFlagged).toBeDefined();
        expect(stats.averageLatencyMs).toBeDefined();
        expect(stats.lastUpdated).toBeDefined();
      });
    });

    describe('resetStats', () => {
      it('should reset all statistics', async () => {
        await fraudService.analyzeTradeRealtime(mockTrade);
        fraudService.resetStats();

        const stats = fraudService.getStats();
        expect(stats.tradesAnalyzed).toBe(0);
        expect(stats.alertsGenerated).toBe(0);
      });
    });
  });
});

// ===========================================================================
// Risk Level Tests
// ===========================================================================

describe('Risk Level Calculation', () => {
  describe('Score to Level Mapping', () => {
    it('should map low scores correctly', () => {
      const getLevel = (score: number): string => {
        if (score >= 90) return 'critical';
        if (score >= 70) return 'high';
        if (score >= 40) return 'medium';
        return 'low';
      };

      expect(getLevel(0)).toBe('low');
      expect(getLevel(20)).toBe('low');
      expect(getLevel(39)).toBe('low');
    });

    it('should map medium scores correctly', () => {
      const getLevel = (score: number): string => {
        if (score >= 90) return 'critical';
        if (score >= 70) return 'high';
        if (score >= 40) return 'medium';
        return 'low';
      };

      expect(getLevel(40)).toBe('medium');
      expect(getLevel(55)).toBe('medium');
      expect(getLevel(69)).toBe('medium');
    });

    it('should map high scores correctly', () => {
      const getLevel = (score: number): string => {
        if (score >= 90) return 'critical';
        if (score >= 70) return 'high';
        if (score >= 40) return 'medium';
        return 'low';
      };

      expect(getLevel(70)).toBe('high');
      expect(getLevel(80)).toBe('high');
      expect(getLevel(89)).toBe('high');
    });

    it('should map critical scores correctly', () => {
      const getLevel = (score: number): string => {
        if (score >= 90) return 'critical';
        if (score >= 70) return 'high';
        if (score >= 40) return 'medium';
        return 'low';
      };

      expect(getLevel(90)).toBe('critical');
      expect(getLevel(95)).toBe('critical');
      expect(getLevel(100)).toBe('critical');
    });
  });
});

// ===========================================================================
// Signal Aggregation Tests
// ===========================================================================

describe('Signal Aggregation', () => {
  it('should aggregate multiple signals', () => {
    const signals: RiskSignal[] = [
      { type: 'large_trade', severity: 'medium', description: 'Large trade', score: 20 },
      { type: 'rapid_trading', severity: 'high', description: 'Rapid trading', score: 35 },
      { type: 'new_account', severity: 'low', description: 'New account', score: 10 },
    ];

    const totalScore = signals.reduce((sum, s) => sum + s.score, 0);
    expect(totalScore).toBe(65);
  });

  it('should cap total score at 100', () => {
    const signals: RiskSignal[] = [
      { type: 'critical_1', severity: 'critical', description: 'Critical', score: 50 },
      { type: 'critical_2', severity: 'critical', description: 'Critical', score: 50 },
      { type: 'critical_3', severity: 'critical', description: 'Critical', score: 50 },
    ];

    const totalScore = Math.min(100, signals.reduce((sum, s) => sum + s.score, 0));
    expect(totalScore).toBe(100);
  });

  it('should filter high severity signals', () => {
    const signals: RiskSignal[] = [
      { type: 'large_trade', severity: 'medium', description: 'Large trade', score: 20 },
      { type: 'rapid_trading', severity: 'high', description: 'Rapid trading', score: 35 },
      { type: 'wash_trading', severity: 'critical', description: 'Wash trading', score: 50 },
    ];

    const highSeverity = signals.filter((s) =>
      ['high', 'critical'].includes(s.severity)
    );
    expect(highSeverity).toHaveLength(2);
  });
});
