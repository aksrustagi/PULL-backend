/**
 * Inngest Client Configuration
 *
 * Event-driven background job processing for PULL
 */

import { Inngest, EventSchemas } from "inngest";

// ============================================================================
// EVENT TYPES
// ============================================================================

type SignalEvents = {
  // Email events
  "email/synced": {
    data: {
      emailId: string;
      accountId: string;
      userId: string;
      externalId: string;
      from: string;
      fromName?: string;
      subject: string;
      body?: string;
      receivedAt: number;
    };
  };

  // Market events
  "market/updated": {
    data: {
      ticker: string;
      yesPrice: number;
      noPrice: number;
      volume24h: number;
      openInterest: number;
    };
  };

  // Social events
  "social/messages.batch": {
    data: {
      roomId: string;
      marketTicker?: string;
      messages: Array<{
        id: string;
        userId: string;
        username: string;
        content: string;
        timestamp: number;
      }>;
    };
  };

  // Signal events
  "signals/detect.email": {
    data: {
      emailId: string;
      userId: string;
    };
  };

  "signals/detect.market": {
    data: {
      marketTickers: string[];
    };
  };

  "signals/detect.correlations": {
    data: {
      marketTickers: string[];
    };
  };

  "signals/generate.insights": {
    data: {
      userId: string;
      timezone?: string;
    };
  };

  // User events
  "user/created": {
    data: {
      userId: string;
      email: string;
    };
  };

  // Scheduled events
  "cron/market.anomalies": {
    data: Record<string, never>;
  };

  "cron/social.sentiment": {
    data: Record<string, never>;
  };

  "cron/daily.correlations": {
    data: Record<string, never>;
  };

  "cron/daily.insights": {
    data: {
      timezone?: string;
    };
  };
};

// ============================================================================
// INNGEST CLIENT
// ============================================================================

export const inngest = new Inngest({
  id: "pull-platform",
  schemas: new EventSchemas().fromRecord<SignalEvents>(),
});

export type { SignalEvents };
