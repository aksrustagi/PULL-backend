/**
 * Analytics Tracker
 * Core event tracking service with batching, privacy, and multi-destination support
 */

import { createHash, randomUUID } from 'crypto';
import {
  AnalyticsEvent,
  AnalyticsConfig,
  AnalyticsDestination,
  EventContext,
  IdentifyTraits,
  PageViewProperties,
  EventBatch,
  BatchResult,
  GdprConsentPreferences,
  AnonymizationConfig,
  EVENT_NAMES,
} from './types';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: AnalyticsConfig = {
  flushInterval: 10000, // 10 seconds
  maxBatchSize: 100,
  debug: false,
  destinations: [],
  redactFields: ['password', 'token', 'secret', 'apiKey', 'ssn', 'creditCard'],
  gdprMode: true,
  anonymousIdKey: 'pull_anonymous_id',
};

const DEFAULT_ANONYMIZATION: AnonymizationConfig = {
  hashUserIds: false,
  removeIp: false,
  truncateUserAgent: true,
  redactPii: true,
  redactFields: ['email', 'phone', 'ssn', 'address', 'dateOfBirth'],
};

// ============================================================================
// Analytics Tracker Class
// ============================================================================

export class AnalyticsTracker {
  private config: AnalyticsConfig;
  private anonymization: AnonymizationConfig;
  private eventQueue: AnalyticsEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private userConsent: Map<string, GdprConsentPreferences> = new Map();
  private userTraits: Map<string, IdentifyTraits> = new Map();
  private destinations: AnalyticsDestinationHandler[] = [];
  private isInitialized = false;

  constructor(
    config: Partial<AnalyticsConfig> = {},
    anonymization: Partial<AnonymizationConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.anonymization = { ...DEFAULT_ANONYMIZATION, ...anonymization };
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the tracker with destinations
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Initialize destinations
    for (const destConfig of this.config.destinations) {
      if (destConfig.enabled) {
        const handler = this.createDestinationHandler(destConfig);
        if (handler) {
          this.destinations.push(handler);
        }
      }
    }

    // Start flush timer
    this.startFlushTimer();
    this.isInitialized = true;

    this.log('Analytics tracker initialized', {
      destinations: this.destinations.map((d) => d.name),
    });
  }

  /**
   * Shutdown the tracker gracefully
   */
  async shutdown(): Promise<void> {
    this.stopFlushTimer();
    await this.flush();
    this.isInitialized = false;
    this.log('Analytics tracker shutdown');
  }

  // ============================================================================
  // Core Tracking Methods
  // ============================================================================

  /**
   * Track an event
   */
  track(
    event: string,
    properties: Record<string, any> = {},
    userId?: string,
    anonymousId?: string,
    context?: Partial<EventContext>
  ): void {
    if (!this.shouldTrack(userId)) {
      return;
    }

    const analyticsEvent: AnalyticsEvent = {
      event,
      userId: this.processUserId(userId),
      anonymousId: anonymousId || this.generateAnonymousId(),
      properties: this.sanitizeProperties(properties),
      timestamp: Date.now(),
      context: this.buildContext(context),
    };

    this.enqueue(analyticsEvent);
    this.log('Event tracked', { event, userId });
  }

  /**
   * Identify a user with traits
   */
  identify(userId: string, traits: IdentifyTraits): void {
    if (!this.shouldTrack(userId)) {
      return;
    }

    const sanitizedTraits = this.sanitizeProperties(traits) as IdentifyTraits;
    this.userTraits.set(userId, {
      ...this.userTraits.get(userId),
      ...sanitizedTraits,
    });

    // Track identify as special event
    this.track('identify', sanitizedTraits, userId);
    this.log('User identified', { userId });
  }

  /**
   * Track a page view
   */
  page(
    name: string,
    properties?: PageViewProperties,
    userId?: string,
    anonymousId?: string
  ): void {
    this.track(
      EVENT_NAMES.PAGE_VIEWED,
      {
        name,
        ...properties,
      },
      userId,
      anonymousId,
      {
        page: properties?.path || name,
        referrer: properties?.referrer,
      }
    );
  }

  /**
   * Alias one user ID to another (for anonymous to identified transition)
   */
  alias(newUserId: string, previousId: string): void {
    this.track(
      'alias',
      {
        newUserId: this.processUserId(newUserId),
        previousId,
      },
      newUserId
    );

    // Migrate traits
    const previousTraits = this.userTraits.get(previousId);
    if (previousTraits) {
      this.userTraits.set(newUserId, previousTraits);
      this.userTraits.delete(previousId);
    }

    this.log('User aliased', { newUserId, previousId });
  }

  /**
   * Set user group/company
   */
  group(userId: string, groupId: string, traits: Record<string, any> = {}): void {
    this.track(
      'group',
      {
        groupId,
        ...this.sanitizeProperties(traits),
      },
      userId
    );
  }

  // ============================================================================
  // Typed Event Helpers
  // ============================================================================

  /**
   * Track user signup
   */
  trackSignup(
    userId: string,
    method: 'email' | 'wallet' | 'google' | 'apple',
    referralCode?: string
  ): void {
    this.track(
      EVENT_NAMES.USER_SIGNED_UP,
      { method, referralCode },
      userId
    );
  }

  /**
   * Track user login
   */
  trackLogin(
    userId: string,
    method: 'email' | 'wallet' | 'google' | 'apple' | 'session'
  ): void {
    this.track(EVENT_NAMES.USER_LOGGED_IN, { method }, userId);
  }

  /**
   * Track KYC events
   */
  trackKycStarted(userId: string, tier: 'basic' | 'intermediate' | 'advanced'): void {
    this.track(EVENT_NAMES.USER_KYC_STARTED, { tier }, userId);
  }

  trackKycCompleted(
    userId: string,
    tier: 'basic' | 'intermediate' | 'advanced',
    durationSeconds: number
  ): void {
    this.track(
      EVENT_NAMES.USER_KYC_COMPLETED,
      { tier, durationSeconds, provider: 'persona' },
      userId
    );
  }

  /**
   * Track trading events
   */
  trackOrderPlaced(
    userId: string,
    ticker: string,
    side: 'buy' | 'sell',
    amount: number,
    type: 'market' | 'limit' | 'stop',
    marketType: 'crypto' | 'prediction' | 'rwa'
  ): void {
    this.track(
      EVENT_NAMES.TRADE_ORDER_PLACED,
      { ticker, side, amount, type, marketType },
      userId
    );
  }

  trackOrderFilled(
    userId: string,
    ticker: string,
    side: 'buy' | 'sell',
    amount: number,
    price: number,
    pnl?: number
  ): void {
    this.track(
      EVENT_NAMES.TRADE_ORDER_FILLED,
      { ticker, side, amount, price, pnl },
      userId
    );
  }

  /**
   * Track engagement events
   */
  trackQuestCompleted(
    userId: string,
    questId: string,
    questType: 'daily' | 'weekly' | 'milestone' | 'special',
    pointsEarned: number
  ): void {
    this.track(
      EVENT_NAMES.ENGAGEMENT_QUEST_COMPLETED,
      { questId, questType, pointsEarned },
      userId
    );
  }

  trackStreakMaintained(
    userId: string,
    streakType: 'login' | 'trading' | 'deposit',
    count: number
  ): void {
    this.track(
      EVENT_NAMES.ENGAGEMENT_STREAK_MAINTAINED,
      { streakType, count },
      userId
    );
  }

  trackPointsEarned(
    userId: string,
    actionType: string,
    amount: number,
    source: string
  ): void {
    this.track(
      EVENT_NAMES.ENGAGEMENT_POINTS_EARNED,
      { actionType, amount, source },
      userId
    );
  }

  /**
   * Track funnel events
   */
  trackOnboardingStep(
    userId: string,
    step: 'email' | 'verify' | 'kyc' | 'agreements' | 'funding' | 'complete',
    stepNumber: number,
    completed: boolean
  ): void {
    this.track(
      EVENT_NAMES.FUNNEL_ONBOARDING_STEP,
      { step, stepNumber, completed },
      userId
    );
  }

  trackDepositStarted(userId: string, method?: string, amount?: number): void {
    this.track(
      EVENT_NAMES.FUNNEL_DEPOSIT_STARTED,
      { method, amount },
      userId
    );
  }

  trackDepositCompleted(
    userId: string,
    amount: number,
    currency: string,
    method: string
  ): void {
    this.track(
      EVENT_NAMES.FUNNEL_DEPOSIT_COMPLETED,
      { amount, currency, method },
      userId
    );
  }

  // ============================================================================
  // GDPR & Consent
  // ============================================================================

  /**
   * Set user consent preferences
   */
  setConsent(userId: string, consent: GdprConsentPreferences): void {
    this.userConsent.set(userId, consent);

    // Track consent change
    if (consent.analytics) {
      this.track('consent.updated', {
        analytics: consent.analytics,
        marketing: consent.marketing,
        personalization: consent.personalization,
        version: consent.version,
      }, userId);
    }
  }

  /**
   * Get user consent
   */
  getConsent(userId: string): GdprConsentPreferences | undefined {
    return this.userConsent.get(userId);
  }

  /**
   * Request user data deletion (GDPR right to erasure)
   */
  async requestDeletion(userId: string): Promise<void> {
    // Track deletion request
    this.track('gdpr.deletion_requested', {}, userId);

    // Clear local data
    this.userTraits.delete(userId);
    this.userConsent.delete(userId);

    // Notify destinations
    for (const destination of this.destinations) {
      await destination.deleteUser?.(userId);
    }

    this.log('User deletion requested', { userId });
  }

  /**
   * Export user data (GDPR right to access)
   */
  async exportUserData(userId: string): Promise<Record<string, any>> {
    const traits = this.userTraits.get(userId);
    const consent = this.userConsent.get(userId);

    return {
      traits,
      consent,
      exportedAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // Batch Processing
  // ============================================================================

  /**
   * Flush all queued events to destinations
   */
  async flush(): Promise<BatchResult[]> {
    if (this.eventQueue.length === 0) {
      return [];
    }

    const events = [...this.eventQueue];
    this.eventQueue = [];

    const batch: EventBatch = {
      events,
      sentAt: Date.now(),
      batchId: randomUUID(),
    };

    const results: BatchResult[] = [];

    for (const destination of this.destinations) {
      try {
        const result = await destination.send(batch);
        results.push(result);
        this.log('Batch sent to destination', {
          destination: destination.name,
          eventCount: events.length,
          success: result.success,
        });
      } catch (error) {
        results.push({
          batchId: batch.batchId,
          success: false,
          processedCount: 0,
          failedCount: events.length,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
        });
        this.log('Failed to send batch', {
          destination: destination.name,
          error,
        });
      }
    }

    return results;
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.eventQueue.length;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private enqueue(event: AnalyticsEvent): void {
    this.eventQueue.push(event);

    if (this.eventQueue.length >= this.config.maxBatchSize) {
      this.flush();
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private shouldTrack(userId?: string): boolean {
    if (!this.config.gdprMode) {
      return true;
    }

    if (!userId) {
      return true; // Allow anonymous tracking
    }

    const consent = this.userConsent.get(userId);
    return consent?.analytics !== false;
  }

  private processUserId(userId?: string): string | undefined {
    if (!userId) {
      return undefined;
    }

    if (this.anonymization.hashUserIds) {
      return this.hashValue(userId);
    }

    return userId;
  }

  private generateAnonymousId(): string {
    return `anon_${randomUUID().replace(/-/g, '')}`;
  }

  private buildContext(partial?: Partial<EventContext>): EventContext {
    const context: EventContext = {
      ...partial,
    };

    // Apply privacy rules
    if (this.anonymization.removeIp) {
      context.ip = undefined;
    }

    if (this.anonymization.truncateUserAgent && context.userAgent) {
      // Keep only browser and OS info, remove version details
      context.userAgent = this.truncateUserAgent(context.userAgent);
    }

    return context;
  }

  private sanitizeProperties(
    properties: Record<string, any>
  ): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(properties)) {
      // Skip redacted fields
      if (this.config.redactFields.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Apply PII redaction
      if (
        this.anonymization.redactPii &&
        this.anonymization.redactFields.includes(key.toLowerCase())
      ) {
        if (typeof value === 'string') {
          sanitized[key] = this.hashValue(value);
        } else {
          sanitized[key] = '[REDACTED]';
        }
        continue;
      }

      // Handle nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeProperties(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private hashValue(value: string): string {
    return createHash('sha256').update(value).digest('hex').substring(0, 16);
  }

  private truncateUserAgent(userAgent: string): string {
    // Extract basic browser and OS info
    const matches = userAgent.match(
      /(Chrome|Firefox|Safari|Edge|Opera|MSIE|Trident)[\/\s](\d+)/i
    );
    const os = userAgent.match(/(Windows|Mac|Linux|Android|iOS)/i);

    const browser = matches ? `${matches[1]}/${matches[2]}` : 'Unknown';
    const osName = os ? os[1] : 'Unknown';

    return `${browser} (${osName})`;
  }

  private createDestinationHandler(
    config: AnalyticsDestination
  ): AnalyticsDestinationHandler | null {
    switch (config.type) {
      case 'convex':
        return new ConvexDestination(config);
      case 'segment':
        return new SegmentDestination(config);
      case 'amplitude':
        return new AmplitudeDestination(config);
      case 'mixpanel':
        return new MixpanelDestination(config);
      case 'posthog':
        return new PosthogDestination(config);
      case 'custom':
        return new CustomDestination(config);
      default:
        this.log('Unknown destination type', { type: config.type });
        return null;
    }
  }

  private log(message: string, data?: Record<string, any>): void {
    if (this.config.debug) {
      console.log(`[Analytics] ${message}`, data || '');
    }
  }
}

// ============================================================================
// Destination Handlers
// ============================================================================

interface AnalyticsDestinationHandler {
  name: string;
  send(batch: EventBatch): Promise<BatchResult>;
  deleteUser?(userId: string): Promise<void>;
}

class ConvexDestination implements AnalyticsDestinationHandler {
  name = 'convex';
  private config: AnalyticsDestination;

  constructor(config: AnalyticsDestination) {
    this.config = config;
  }

  async send(batch: EventBatch): Promise<BatchResult> {
    // Send to Convex mutation
    const endpoint = this.config.config.endpoint as string;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.config.token}`,
        },
        body: JSON.stringify({
          events: batch.events,
          batchId: batch.batchId,
          sentAt: batch.sentAt,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return {
        batchId: batch.batchId,
        success: true,
        processedCount: batch.events.length,
        failedCount: 0,
      };
    } catch (error) {
      return {
        batchId: batch.batchId,
        success: false,
        processedCount: 0,
        failedCount: batch.events.length,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }
}

class SegmentDestination implements AnalyticsDestinationHandler {
  name = 'segment';
  private config: AnalyticsDestination;

  constructor(config: AnalyticsDestination) {
    this.config = config;
  }

  async send(batch: EventBatch): Promise<BatchResult> {
    const writeKey = this.config.config.writeKey as string;
    const endpoint = 'https://api.segment.io/v1/batch';

    try {
      // Use btoa for browser compatibility or Buffer for Node.js
      const basicAuth = typeof Buffer !== 'undefined'
        ? Buffer.from(writeKey + ':').toString('base64')
        : btoa(writeKey + ':');
        
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${basicAuth}`,
        },
        body: JSON.stringify({
          batch: batch.events.map((event) => ({
            type: 'track',
            event: event.event,
            userId: event.userId,
            anonymousId: event.anonymousId,
            properties: event.properties,
            timestamp: new Date(event.timestamp).toISOString(),
            context: event.context,
          })),
          sentAt: new Date(batch.sentAt).toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return {
        batchId: batch.batchId,
        success: true,
        processedCount: batch.events.length,
        failedCount: 0,
      };
    } catch (error) {
      return {
        batchId: batch.batchId,
        success: false,
        processedCount: 0,
        failedCount: batch.events.length,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  async deleteUser(userId: string): Promise<void> {
    const writeKey = this.config.config.writeKey as string;

    await fetch('https://platform.segmentapis.com/v1beta/workspaces/default/regulations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${writeKey}`,
      },
      body: JSON.stringify({
        regulation_type: 'SUPPRESS_AND_DELETE',
        attributes: {
          name: 'userId',
          values: [userId],
        },
      }),
    });
  }
}

class AmplitudeDestination implements AnalyticsDestinationHandler {
  name = 'amplitude';
  private config: AnalyticsDestination;

  constructor(config: AnalyticsDestination) {
    this.config = config;
  }

  async send(batch: EventBatch): Promise<BatchResult> {
    const apiKey = this.config.config.apiKey as string;
    const endpoint = 'https://api2.amplitude.com/2/httpapi';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          events: batch.events.map((event) => ({
            event_type: event.event,
            user_id: event.userId,
            device_id: event.anonymousId,
            event_properties: event.properties,
            time: event.timestamp,
            platform: event.context.device?.os,
            os_name: event.context.device?.os,
            device_type: event.context.device?.type,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return {
        batchId: batch.batchId,
        success: true,
        processedCount: batch.events.length,
        failedCount: 0,
      };
    } catch (error) {
      return {
        batchId: batch.batchId,
        success: false,
        processedCount: 0,
        failedCount: batch.events.length,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }
}

class MixpanelDestination implements AnalyticsDestinationHandler {
  name = 'mixpanel';
  private config: AnalyticsDestination;

  constructor(config: AnalyticsDestination) {
    this.config = config;
  }

  async send(batch: EventBatch): Promise<BatchResult> {
    const token = this.config.config.token as string;
    const endpoint = 'https://api.mixpanel.com/track';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/plain',
        },
        body: JSON.stringify(
          batch.events.map((event) => ({
            event: event.event,
            properties: {
              token,
              distinct_id: event.userId || event.anonymousId,
              time: Math.floor(event.timestamp / 1000),
              $insert_id: randomUUID(),
              ...event.properties,
            },
          }))
        ),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return {
        batchId: batch.batchId,
        success: true,
        processedCount: batch.events.length,
        failedCount: 0,
      };
    } catch (error) {
      return {
        batchId: batch.batchId,
        success: false,
        processedCount: 0,
        failedCount: batch.events.length,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }
}

class PosthogDestination implements AnalyticsDestinationHandler {
  name = 'posthog';
  private config: AnalyticsDestination;

  constructor(config: AnalyticsDestination) {
    this.config = config;
  }

  async send(batch: EventBatch): Promise<BatchResult> {
    const apiKey = this.config.config.apiKey as string;
    const host = (this.config.config.host as string) || 'https://app.posthog.com';
    const endpoint = `${host}/batch/`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          batch: batch.events.map((event) => ({
            event: event.event,
            distinct_id: event.userId || event.anonymousId,
            properties: {
              ...event.properties,
              $set: event.properties,
            },
            timestamp: new Date(event.timestamp).toISOString(),
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return {
        batchId: batch.batchId,
        success: true,
        processedCount: batch.events.length,
        failedCount: 0,
      };
    } catch (error) {
      return {
        batchId: batch.batchId,
        success: false,
        processedCount: 0,
        failedCount: batch.events.length,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }
}

class CustomDestination implements AnalyticsDestinationHandler {
  name: string;
  private config: AnalyticsDestination;

  constructor(config: AnalyticsDestination) {
    this.config = config;
    this.name = config.name;
  }

  async send(batch: EventBatch): Promise<BatchResult> {
    const endpoint = this.config.config.endpoint as string;
    const headers = (this.config.config.headers as Record<string, string>) || {};

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return {
        batchId: batch.batchId,
        success: true,
        processedCount: batch.events.length,
        failedCount: 0,
      };
    } catch (error) {
      return {
        batchId: batch.batchId,
        success: false,
        processedCount: 0,
        failedCount: batch.events.length,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let trackerInstance: AnalyticsTracker | null = null;

export function getTracker(config?: Partial<AnalyticsConfig>): AnalyticsTracker {
  if (!trackerInstance) {
    trackerInstance = new AnalyticsTracker(config);
  }
  return trackerInstance;
}

export function createTracker(config?: Partial<AnalyticsConfig>): AnalyticsTracker {
  return new AnalyticsTracker(config);
}
