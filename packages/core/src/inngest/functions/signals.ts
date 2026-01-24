/**
 * Inngest Functions for AI Signal Detection
 *
 * Background job processing for:
 * - Email signal detection
 * - Market anomaly detection
 * - Social sentiment aggregation
 * - Market correlation calculation
 * - Daily insights generation
 */

import { inngest } from "../client";
import {
  SignalDetectionService,
  createSignalDetectionService,
  type Email,
  type UserContext,
  type Market,
  type ChatMessage,
  type Signal,
  type UserPosition,
} from "../../services/ai";

// ============================================================================
// SERVICE INITIALIZATION
// ============================================================================

function getSignalService(): SignalDetectionService {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }
  return createSignalDetectionService({ anthropicApiKey: apiKey });
}

// ============================================================================
// EMAIL SIGNAL DETECTION
// ============================================================================

/**
 * Detect trading signals from synced emails
 * Trigger: email/synced event
 */
export const detectEmailSignals = inngest.createFunction(
  {
    id: "detect-email-signals",
    name: "Detect Email Signals",
    throttle: {
      limit: 10,
      period: "1m",
      key: "event.data.userId",
    },
    retries: 3,
  },
  { event: "email/synced" },
  async ({ event, step }) => {
    const { emailId, userId, externalId, from, fromName, subject, body, receivedAt } = event.data;

    // Step 1: Check if already processed
    const alreadyProcessed = await step.run("check-processed", async () => {
      // In production, this would query the signalProcessingLog
      // For now, we'll use a simple check
      const convexUrl = process.env.CONVEX_URL;
      if (!convexUrl) return false;

      const response = await fetch(`${convexUrl}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "signals:wasSourceProcessed",
          args: { sourceType: "email", sourceId: externalId },
        }),
      });

      if (!response.ok) return false;
      const result = await response.json();
      return result.value === true;
    });

    if (alreadyProcessed) {
      return { status: "skipped", reason: "already_processed" };
    }

    // Step 2: Get user context
    const userContext = await step.run("get-user-context", async () => {
      const convexUrl = process.env.CONVEX_URL;
      if (!convexUrl) {
        return getDefaultUserContext(userId);
      }

      try {
        // Fetch user preferences
        const prefsResponse = await fetch(`${convexUrl}/api/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: "signals:getUserPreferences",
            args: { userId },
          }),
        });

        const prefs = prefsResponse.ok ? (await prefsResponse.json()).value : null;

        // Check if email analysis is enabled
        if (prefs && !prefs.emailAnalysisEnabled) {
          return null; // User opted out
        }

        // Fetch user positions
        const positionsResponse = await fetch(`${convexUrl}/api/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: "positions:getByUser",
            args: { userId },
          }),
        });

        const positions = positionsResponse.ok
          ? (await positionsResponse.json()).value ?? []
          : [];

        return {
          userId,
          interests: prefs?.interests ?? [],
          activeMarkets: positions.map((p: { symbol: string }) => p.symbol),
          positions: positions.map((p: {
            symbol: string;
            side: string;
            quantity: number;
            currentPrice: number;
            averageEntryPrice: number;
            unrealizedPnL: number;
          }) => ({
            symbol: p.symbol,
            side: p.side as "long" | "short",
            quantity: p.quantity,
            currentPrice: p.currentPrice,
            averageEntryPrice: p.averageEntryPrice,
            unrealizedPnL: p.unrealizedPnL,
          })),
          location: undefined,
          preferences: prefs ?? getDefaultPreferences(),
        } as UserContext;
      } catch (error) {
        console.error("Error fetching user context:", error);
        return getDefaultUserContext(userId);
      }
    });

    if (!userContext) {
      return { status: "skipped", reason: "email_analysis_disabled" };
    }

    // Step 3: Detect signals using AI
    const signals = await step.run("detect-signals", async () => {
      const service = getSignalService();

      const email: Email = {
        id: emailId,
        from,
        fromName,
        to: [],
        subject,
        body: body ?? "",
        date: new Date(receivedAt),
      };

      return await service.detectEmailSignals(email, userContext);
    });

    if (signals.length === 0) {
      // Log that we processed but found nothing
      await step.run("log-no-signals", async () => {
        await logProcessedSource("email", externalId, userId, 0);
      });

      return { status: "completed", signalsFound: 0 };
    }

    // Step 4: Store signals and create user associations
    const storedSignals = await step.run("store-signals", async () => {
      const stored: string[] = [];

      for (const signal of signals) {
        const signalId = await storeSignal(signal);
        if (signalId) {
          // Create user signal association
          const relevanceScore = calculateRelevanceScore(signal, userContext);
          await createUserSignal(userId, signalId, relevanceScore);
          stored.push(signalId);
        }
      }

      return stored;
    });

    // Step 5: Log processed source
    await step.run("log-processed", async () => {
      await logProcessedSource("email", externalId, userId, signals.length);
    });

    // Step 6: Send notification for high-urgency signals
    const highUrgencySignals = signals.filter((s) => s.urgency === "high");
    if (highUrgencySignals.length > 0 && userContext.preferences.pushNotificationsEnabled) {
      await step.run("send-notification", async () => {
        // In production, this would send a push notification
        console.log(`High urgency signals detected for user ${userId}:`, highUrgencySignals.length);
        // await sendPushNotification(userId, {
        //   title: "New Trading Signal",
        //   body: highUrgencySignals[0].title,
        // });
      });
    }

    return {
      status: "completed",
      signalsFound: signals.length,
      signalsStored: storedSignals.length,
      highUrgency: highUrgencySignals.length,
    };
  }
);

// ============================================================================
// MARKET ANOMALY DETECTION
// ============================================================================

/**
 * Detect market anomalies (scheduled every 5 minutes)
 */
export const detectMarketAnomalies = inngest.createFunction(
  {
    id: "detect-market-anomalies",
    name: "Detect Market Anomalies",
    retries: 2,
  },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    // Step 1: Fetch active markets
    const markets = await step.run("fetch-markets", async () => {
      return await fetchActiveMarkets();
    });

    if (markets.length === 0) {
      return { status: "completed", anomaliesFound: 0 };
    }

    // Step 2: Detect anomalies
    const signals = await step.run("detect-anomalies", async () => {
      const service = getSignalService();
      return await service.detectMarketAnomalies(markets);
    });

    if (signals.length === 0) {
      return { status: "completed", anomaliesFound: 0 };
    }

    // Step 3: Store signals
    const storedCount = await step.run("store-signals", async () => {
      let count = 0;
      for (const signal of signals) {
        const signalId = await storeSignal(signal);
        if (signalId) {
          count++;

          // Find users interested in this market and create user signals
          const interestedUsers = await findInterestedUsers(signal.relatedMarkets);
          for (const userId of interestedUsers) {
            await createUserSignal(userId, signalId, 80); // High relevance for market alerts
          }
        }
      }
      return count;
    });

    return {
      status: "completed",
      marketsAnalyzed: markets.length,
      anomaliesFound: signals.length,
      signalsStored: storedCount,
    };
  }
);

// ============================================================================
// SOCIAL SENTIMENT AGGREGATION
// ============================================================================

/**
 * Aggregate social sentiment from chat rooms (scheduled every 15 minutes)
 */
export const aggregateSocialSentiment = inngest.createFunction(
  {
    id: "aggregate-social-sentiment",
    name: "Aggregate Social Sentiment",
    retries: 2,
  },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    // Step 1: Get active rooms linked to markets
    const rooms = await step.run("fetch-active-rooms", async () => {
      return await fetchActiveRooms();
    });

    if (rooms.length === 0) {
      return { status: "completed", roomsAnalyzed: 0 };
    }

    // Step 2: Analyze each room
    const results = await step.run("analyze-rooms", async () => {
      const service = getSignalService();
      const analyzed: { roomId: string; signalCreated: boolean }[] = [];

      for (const room of rooms) {
        // Get recent messages
        const messages = await fetchRoomMessages(room.roomId, 15); // Last 15 minutes

        if (messages.length < 5) {
          analyzed.push({ roomId: room.roomId, signalCreated: false });
          continue;
        }

        // Analyze sentiment
        const sentiment = await service.aggregateSocialSentiment(messages, room.marketTicker);

        if (sentiment) {
          const signal = service.createSocialSignal(sentiment);

          if (signal) {
            const signalId = await storeSignal(signal);
            if (signalId) {
              // Notify users following this market
              const interestedUsers = await findInterestedUsers(
                room.marketTicker ? [room.marketTicker] : []
              );
              for (const userId of interestedUsers) {
                await createUserSignal(userId, signalId, 70);
              }
            }
            analyzed.push({ roomId: room.roomId, signalCreated: true });
          } else {
            analyzed.push({ roomId: room.roomId, signalCreated: false });
          }
        } else {
          analyzed.push({ roomId: room.roomId, signalCreated: false });
        }
      }

      return analyzed;
    });

    return {
      status: "completed",
      roomsAnalyzed: rooms.length,
      signalsCreated: results.filter((r) => r.signalCreated).length,
    };
  }
);

// ============================================================================
// MARKET CORRELATION CALCULATION
// ============================================================================

/**
 * Calculate market correlations (daily at midnight UTC)
 */
export const calculateCorrelations = inngest.createFunction(
  {
    id: "calculate-market-correlations",
    name: "Calculate Market Correlations",
    retries: 2,
  },
  { cron: "0 0 * * *" },
  async ({ step }) => {
    // Step 1: Get top markets by volume
    const markets = await step.run("fetch-top-markets", async () => {
      return await fetchTopMarketsByVolume(100);
    });

    if (markets.length < 2) {
      return { status: "completed", correlationsFound: 0 };
    }

    // Step 2: Calculate correlations
    const correlations = await step.run("calculate-correlations", async () => {
      const service = getSignalService();
      return service.findMarketCorrelations(markets);
    });

    // Step 3: Store correlations
    const storedCount = await step.run("store-correlations", async () => {
      let count = 0;
      for (const corr of correlations) {
        if (corr.isSignificant && Math.abs(corr.correlation) >= 0.7) {
          await storeCorrelation(corr);
          count++;
        }
      }
      return count;
    });

    // Step 4: Create signals for strong new correlations
    const newCorrelationSignals = await step.run("create-correlation-signals", async () => {
      const signals: Signal[] = [];

      for (const corr of correlations) {
        if (Math.abs(corr.correlation) >= 0.8) {
          const direction = corr.correlation > 0 ? "positive" : "negative";
          const signal: Signal = {
            signalId: `corr_${corr.marketA}_${corr.marketB}_${Date.now()}`,
            type: "correlation",
            source: `correlation:${corr.marketA}:${corr.marketB}`,
            title: `Strong ${direction} correlation: ${corr.marketA} & ${corr.marketB}`,
            description: `Markets show ${Math.abs(corr.correlation * 100).toFixed(0)}% ${direction} correlation based on ${corr.sampleSize} data points`,
            confidence: Math.min(95, 60 + Math.abs(corr.correlation) * 40),
            sentiment: "neutral",
            urgency: Math.abs(corr.correlation) >= 0.9 ? "high" : "medium",
            relatedMarkets: [corr.marketA, corr.marketB],
            relatedAssets: [],
            metadata: {
              correlationCoefficient: corr.correlation,
              sampleSize: corr.sampleSize,
              pValue: corr.pValue,
            },
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
            createdAt: Date.now(),
          };

          const signalId = await storeSignal(signal);
          if (signalId) {
            signals.push(signal);
          }
        }
      }

      return signals.length;
    });

    return {
      status: "completed",
      marketsAnalyzed: markets.length,
      correlationsFound: correlations.length,
      correlationsStored: storedCount,
      signalsCreated: newCorrelationSignals,
    };
  }
);

// ============================================================================
// DAILY INSIGHTS GENERATION
// ============================================================================

/**
 * Generate daily insights for users (6am in their timezone)
 */
export const generateDailyInsights = inngest.createFunction(
  {
    id: "generate-daily-insights",
    name: "Generate Daily Insights",
    retries: 2,
  },
  { cron: "0 6 * * *" }, // 6am UTC, will handle timezones per user
  async ({ step }) => {
    // Step 1: Get users with daily insights enabled
    const users = await step.run("fetch-users", async () => {
      return await fetchUsersForDailyInsights();
    });

    if (users.length === 0) {
      return { status: "completed", usersProcessed: 0 };
    }

    // Step 2: Generate insights for each user (in batches)
    const batchSize = 10;
    let processedCount = 0;

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      await step.run(`process-batch-${i}`, async () => {
        const service = getSignalService();

        for (const user of batch) {
          try {
            // Get user data
            const [positions, signals, movements] = await Promise.all([
              fetchUserPositions(user.userId),
              fetchUserRecentSignals(user.userId, 24),
              fetchMarketMovements(user.interests),
            ]);

            // Generate insights
            const briefing = await service.generateUserInsights(
              user.userId,
              positions,
              signals,
              movements,
              user.interests,
              user.displayName
            );

            // Store insights
            for (const insight of briefing.insights) {
              await storeUserInsight(user.userId, insight);
            }

            // Send notification/email
            if (user.pushNotificationsEnabled) {
              console.log(`Daily insights generated for user ${user.userId}`);
              // await sendDailyBriefingNotification(user.userId, briefing);
            }

            processedCount++;
          } catch (error) {
            console.error(`Error generating insights for user ${user.userId}:`, error);
          }
        }
      });
    }

    return {
      status: "completed",
      usersProcessed: processedCount,
      totalUsers: users.length,
    };
  }
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDefaultUserContext(userId: string): UserContext {
  return {
    userId,
    interests: [],
    activeMarkets: [],
    positions: [],
    preferences: getDefaultPreferences(),
  };
}

function getDefaultPreferences() {
  return {
    emailAnalysisEnabled: false,
    socialAnalysisEnabled: true,
    marketAlertsEnabled: true,
    dailyInsightsEnabled: true,
    pushNotificationsEnabled: true,
    minConfidenceThreshold: 50,
    preferredUrgencyLevel: "all" as const,
    interests: [],
    excludedMarkets: [],
    timezone: "UTC",
  };
}

function calculateRelevanceScore(signal: Signal, context: UserContext): number {
  let score = signal.confidence;

  // Boost for matching interests
  for (const interest of context.interests) {
    if (signal.title.toLowerCase().includes(interest.toLowerCase())) {
      score += 10;
    }
    if (signal.description.toLowerCase().includes(interest.toLowerCase())) {
      score += 5;
    }
  }

  // Boost for matching positions
  for (const position of context.positions) {
    if (signal.relatedMarkets.includes(position.symbol)) {
      score += 20;
    }
  }

  // Urgency boost
  if (signal.urgency === "high") score += 15;
  else if (signal.urgency === "medium") score += 5;

  return Math.min(100, score);
}

// ============================================================================
// DATA FETCHING STUBS (to be implemented with actual Convex calls)
// ============================================================================

async function logProcessedSource(
  sourceType: string,
  sourceId: string,
  userId: string,
  signalsGenerated: number
): Promise<void> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return;

  await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "signals:logProcessedSource",
      args: { sourceType, sourceId, userId, signalsGenerated },
    }),
  });
}

async function storeSignal(signal: Signal): Promise<string | null> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return null;

  const response = await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "signals:createSignal",
      args: signal,
    }),
  });

  if (!response.ok) return null;
  const result = await response.json();
  return result.value;
}

async function createUserSignal(
  userId: string,
  signalId: string,
  relevanceScore: number
): Promise<void> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return;

  await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "signals:createUserSignal",
      args: { userId, signalId, relevanceScore },
    }),
  });
}

async function findInterestedUsers(marketTickers: string[]): Promise<string[]> {
  // In production, query users with positions in these markets
  // or with matching interests
  return [];
}

async function fetchActiveMarkets(): Promise<Market[]> {
  // Fetch from Convex/Kalshi
  return [];
}

async function fetchActiveRooms(): Promise<{ roomId: string; marketTicker?: string }[]> {
  // Fetch Matrix rooms linked to markets
  return [];
}

async function fetchRoomMessages(roomId: string, minutesBack: number): Promise<ChatMessage[]> {
  // Fetch from Matrix/Convex
  return [];
}

async function fetchTopMarketsByVolume(limit: number): Promise<Market[]> {
  // Fetch from Convex/Kalshi
  return [];
}

async function storeCorrelation(correlation: {
  marketA: string;
  marketB: string;
  correlation: number;
  sampleSize: number;
  pValue: number;
}): Promise<void> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return;

  await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "signals:upsertCorrelation",
      args: correlation,
    }),
  });
}

async function fetchUsersForDailyInsights(): Promise<
  Array<{
    userId: string;
    displayName?: string;
    interests: string[];
    pushNotificationsEnabled: boolean;
    timezone: string;
  }>
> {
  // Fetch users with daily insights enabled
  return [];
}

async function fetchUserPositions(userId: string): Promise<UserPosition[]> {
  // Fetch from Convex
  return [];
}

async function fetchUserRecentSignals(userId: string, hoursBack: number): Promise<Signal[]> {
  // Fetch from Convex
  return [];
}

async function fetchMarketMovements(
  interests: string[]
): Promise<{ market: string; change: number }[]> {
  // Fetch market movements in user's interest areas
  return [];
}

async function storeUserInsight(
  userId: string,
  insight: {
    insightType: string;
    title: string;
    content: string;
    priority: number;
    action?: string;
    relatedMarket?: string;
    relatedSignals: string[];
  }
): Promise<void> {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) return;

  await fetch(`${convexUrl}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "signals:createUserInsight",
      args: {
        userId,
        insightType: insight.insightType,
        title: insight.title,
        content: insight.content,
        priority: insight.priority,
        relatedSignals: [],
      },
    }),
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export const signalFunctions = [
  detectEmailSignals,
  detectMarketAnomalies,
  aggregateSocialSentiment,
  calculateCorrelations,
  generateDailyInsights,
];
