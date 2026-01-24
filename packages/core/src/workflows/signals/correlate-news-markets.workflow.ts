/**
 * Correlate News to Markets Workflow
 * Triggered on news ingestion to identify market correlations
 */

import {
  proxyActivities,
  defineQuery,
  defineSignal,
  setHandler,
} from "@temporalio/workflow";

import type * as activities from "./activities";

// Activity proxies
const {
  correlateNewsToMarkets,
  storeSignal,
  sendSignalAlert,
  aggregateSentiment,
  recordSignalAuditLog,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 seconds",
  heartbeatTimeout: "30 seconds",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Workflow input type
export interface CorrelateNewsInput {
  newsItems: Array<{
    newsId: string;
    title: string;
    content: string;
    source: string;
    publishedAt: string;
    categories: string[];
  }>;
  aggregateSentimentAcrossItems?: boolean;
}

// Workflow status type
export interface CorrelateNewsStatus {
  workflowId: string;
  status: "processing" | "completed" | "failed";
  newsProcessed: number;
  signalsGenerated: number;
  signalIds: string[];
  aggregatedSentiment?: {
    overall: string;
    score: number;
    confidence: number;
  };
  errors: Array<{ newsId: string; error: string }>;
}

// Queries
export const getStatusQuery = defineQuery<CorrelateNewsStatus>("getStatus");

// Signals
export const cancelSignal = defineSignal("cancel");

/**
 * Correlate News to Markets Workflow
 * Analyzes news articles to find market correlations and generate signals
 */
export async function correlateNewsToMarketsWorkflow(
  input: CorrelateNewsInput
): Promise<CorrelateNewsStatus> {
  const { newsItems, aggregateSentimentAcrossItems } = input;

  const workflowId = `news_correlation_${Date.now()}`;

  // Initialize status
  const status: CorrelateNewsStatus = {
    workflowId,
    status: "processing",
    newsProcessed: 0,
    signalsGenerated: 0,
    signalIds: [],
    errors: [],
  };

  let cancelled = false;

  // Set up handlers
  setHandler(getStatusQuery, () => status);
  setHandler(cancelSignal, () => {
    cancelled = true;
  });

  try {
    await recordSignalAuditLog({
      action: "news_correlation_started",
      signalId: workflowId,
      signalType: "news",
      metadata: { newsCount: newsItems.length },
    });

    const newsContents: Array<{ source: string; content: string; weight: number }> = [];

    // Process each news item for market correlations
    for (const newsItem of newsItems) {
      if (cancelled) {
        status.status = "completed";
        break;
      }

      try {
        // Analyze news for market correlations
        const signal = await correlateNewsToMarkets({
          newsId: newsItem.newsId,
          title: newsItem.title,
          content: newsItem.content,
          source: newsItem.source,
          publishedAt: newsItem.publishedAt,
          categories: newsItem.categories,
        });

        status.newsProcessed++;

        // Collect content for sentiment aggregation
        newsContents.push({
          source: newsItem.source,
          content: `${newsItem.title}\n${newsItem.content.slice(0, 500)}`,
          weight: 1.0,
        });

        // If a correlation signal was found, store it
        if (signal) {
          const signalId = await storeSignal(signal);
          status.signalsGenerated++;
          status.signalIds.push(signalId);

          // Alert on high/critical signals
          if (signal.severity === "high" || signal.severity === "critical") {
            // Note: News signals might not have a specific userId
            // In production, you'd notify subscribed users
            await recordSignalAuditLog({
              action: "high_priority_news_signal",
              signalId,
              signalType: "news",
              metadata: {
                severity: signal.severity,
                markets: signal.relatedMarkets,
                events: signal.relatedEvents,
              },
            });
          }

          await recordSignalAuditLog({
            action: "news_signal_generated",
            signalId,
            signalType: "news",
            metadata: {
              newsId: newsItem.newsId,
              source: newsItem.source,
              confidence: signal.confidence,
              markets: signal.relatedMarkets,
            },
          });
        }
      } catch (error) {
        status.errors.push({
          newsId: newsItem.newsId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Aggregate sentiment across all news items if requested
    if (aggregateSentimentAcrossItems && newsContents.length > 0 && !cancelled) {
      try {
        const sentiment = await aggregateSentiment(newsContents);
        status.aggregatedSentiment = {
          overall: sentiment.overallSentiment,
          score: sentiment.sentimentScore,
          confidence: sentiment.confidence,
        };

        // If sentiment is significant, create a sentiment signal
        if (Math.abs(sentiment.sentimentScore) > 0.5 && sentiment.confidence > 0.6) {
          const sentimentSignal = await storeSignal({
            type: "sentiment",
            source: "news_aggregation",
            title: `Aggregated News Sentiment: ${sentiment.overallSentiment.toUpperCase()}`,
            description: sentiment.summary,
            confidence: sentiment.confidence,
            severity:
              Math.abs(sentiment.sentimentScore) > 0.8
                ? "high"
                : Math.abs(sentiment.sentimentScore) > 0.6
                  ? "medium"
                  : "low",
            relatedMarkets: [], // General market sentiment
            relatedEvents: [],
            sentiment: sentiment.overallSentiment,
            timeHorizon: "short_term",
            aiAnalysis: sentiment.summary,
          });

          status.signalIds.push(sentimentSignal);
          status.signalsGenerated++;
        }
      } catch (error) {
        // Sentiment aggregation failure is not critical
        console.error("Sentiment aggregation failed:", error);
      }
    }

    status.status = "completed";

    await recordSignalAuditLog({
      action: "news_correlation_completed",
      signalId: workflowId,
      signalType: "news",
      metadata: {
        newsProcessed: status.newsProcessed,
        signalsGenerated: status.signalsGenerated,
        aggregatedSentiment: status.aggregatedSentiment,
        errors: status.errors.length,
      },
    });

    return status;
  } catch (error) {
    status.status = "failed";

    await recordSignalAuditLog({
      action: "news_correlation_failed",
      signalId: workflowId,
      signalType: "news",
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}
