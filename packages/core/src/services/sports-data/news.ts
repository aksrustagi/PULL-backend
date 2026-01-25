/**
 * Player News & Injury Feed Integration
 * ESPN News API + Custom injury tracking
 */

import { EventEmitter } from "events";

// ============================================================================
// Types
// ============================================================================

export interface PlayerNews {
  id: string;
  playerId: string;
  playerName: string;
  team: string;
  position: string;
  headline: string;
  summary: string;
  source: "espn" | "rotoworld" | "fantasypros" | "twitter" | "official";
  category: "injury" | "transaction" | "performance" | "depth_chart" | "general" | "suspension";
  impact: "high" | "medium" | "low";
  fantasyImpact?: {
    direction: "positive" | "negative" | "neutral";
    magnitude: number; // 1-10
    affectedPositions: string[];
    rostership: {
      add: boolean;
      drop: boolean;
      hold: boolean;
    };
  };
  publishedAt: number;
  url?: string;
  relatedPlayerIds?: string[];
}

export interface InjuryUpdate {
  playerId: string;
  playerName: string;
  team: string;
  position: string;
  previousStatus: string;
  newStatus: "active" | "questionable" | "doubtful" | "out" | "injured_reserve" | "pup" | "suspended";
  bodyPart?: string;
  description?: string;
  estimatedReturn?: string;
  practiceStatus?: "full" | "limited" | "dnp";
  updatedAt: number;
  source: string;
  gameImpact: {
    week: number;
    likelihood: number; // 0-1 chance of playing
    projectionAdjustment: number; // Multiplier (0.5 = 50% reduction)
  };
}

export interface InjuryReport {
  team: string;
  week: number;
  updatedAt: number;
  players: InjuryUpdate[];
}

export interface NewsFilter {
  playerIds?: string[];
  teams?: string[];
  positions?: string[];
  categories?: PlayerNews["category"][];
  impact?: PlayerNews["impact"][];
  since?: number;
  limit?: number;
}

// ============================================================================
// News Feed Service
// ============================================================================

export class PlayerNewsFeedService extends EventEmitter {
  private cache: Map<string, { data: any; expiresAt: number }> = new Map();
  private pollInterval: NodeJS.Timer | null = null;
  private lastPollTimestamp: number = 0;
  private subscribers: Map<string, Set<string>> = new Map(); // playerId -> userIds

  constructor(private config: {
    espnBaseUrl?: string;
    pollIntervalMs?: number;
    cacheTimeMs?: number;
    maxCacheSize?: number;
  } = {}) {
    super();
    this.config = {
      espnBaseUrl: "https://site.api.espn.com/apis/site/v2/sports/football/nfl",
      pollIntervalMs: 60000, // Poll every 60 seconds
      cacheTimeMs: 300000, // Cache for 5 minutes
      maxCacheSize: 10000,
      ...config,
    };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    this.pollInterval = setInterval(() => {
      this.pollForUpdates();
    }, this.config.pollIntervalMs!);

    // Initial poll
    this.pollForUpdates();
    this.emit("started");
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.emit("stopped");
  }

  // ============================================================================
  // Subscription Management
  // ============================================================================

  subscribeToPlayer(userId: string, playerId: string): void {
    if (!this.subscribers.has(playerId)) {
      this.subscribers.set(playerId, new Set());
    }
    this.subscribers.get(playerId)!.add(userId);
  }

  unsubscribeFromPlayer(userId: string, playerId: string): void {
    const subs = this.subscribers.get(playerId);
    if (subs) {
      subs.delete(userId);
      if (subs.size === 0) {
        this.subscribers.delete(playerId);
      }
    }
  }

  getSubscribedUsers(playerId: string): string[] {
    return Array.from(this.subscribers.get(playerId) || []);
  }

  // ============================================================================
  // News Fetching
  // ============================================================================

  async getNews(filter: NewsFilter = {}): Promise<PlayerNews[]> {
    const cacheKey = `news_${JSON.stringify(filter)}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const news = await this.fetchNews(filter);
    this.setCache(cacheKey, news);
    return news;
  }

  async getPlayerNews(playerId: string, limit: number = 20): Promise<PlayerNews[]> {
    return this.getNews({ playerIds: [playerId], limit });
  }

  async getTeamNews(team: string, limit: number = 20): Promise<PlayerNews[]> {
    return this.getNews({ teams: [team], limit });
  }

  async getTrendingNews(limit: number = 50): Promise<PlayerNews[]> {
    return this.getNews({ impact: ["high", "medium"], limit });
  }

  // ============================================================================
  // Injury Report
  // ============================================================================

  async getInjuryReport(team?: string, week?: number): Promise<InjuryReport[]> {
    const cacheKey = `injuries_${team || "all"}_${week || "current"}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const reports = await this.fetchInjuryReports(team, week);
    this.setCache(cacheKey, reports);
    return reports;
  }

  async getPlayerInjuryStatus(playerId: string): Promise<InjuryUpdate | null> {
    const cacheKey = `injury_${playerId}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const status = await this.fetchPlayerInjury(playerId);
    if (status) {
      this.setCache(cacheKey, status, 120000); // 2 minute cache for injury status
    }
    return status;
  }

  // ============================================================================
  // Fantasy Impact Analysis
  // ============================================================================

  analyzeFantasyImpact(news: PlayerNews): PlayerNews["fantasyImpact"] {
    const impact: PlayerNews["fantasyImpact"] = {
      direction: "neutral",
      magnitude: 1,
      affectedPositions: [news.position],
      rostership: { add: false, drop: false, hold: true },
    };

    switch (news.category) {
      case "injury":
        if (news.impact === "high") {
          impact.direction = "negative";
          impact.magnitude = 8;
          impact.rostership = { add: false, drop: true, hold: false };
          // Backup player benefits
          impact.affectedPositions.push(news.position); // Handcuff
        } else if (news.impact === "medium") {
          impact.direction = "negative";
          impact.magnitude = 5;
          impact.rostership = { add: false, drop: false, hold: true };
        }
        break;

      case "transaction":
        if (news.headline.toLowerCase().includes("trade")) {
          impact.direction = "neutral"; // Context-dependent
          impact.magnitude = 6;
        } else if (news.headline.toLowerCase().includes("sign")) {
          impact.direction = "positive";
          impact.magnitude = 4;
        } else if (news.headline.toLowerCase().includes("released") || news.headline.toLowerCase().includes("cut")) {
          impact.direction = "negative";
          impact.magnitude = 9;
          impact.rostership = { add: false, drop: true, hold: false };
        }
        break;

      case "depth_chart":
        if (news.headline.toLowerCase().includes("promoted") || news.headline.toLowerCase().includes("starter")) {
          impact.direction = "positive";
          impact.magnitude = 7;
          impact.rostership = { add: true, drop: false, hold: true };
        } else if (news.headline.toLowerCase().includes("demoted") || news.headline.toLowerCase().includes("backup")) {
          impact.direction = "negative";
          impact.magnitude = 6;
          impact.rostership = { add: false, drop: true, hold: false };
        }
        break;

      case "suspension":
        impact.direction = "negative";
        impact.magnitude = 9;
        impact.rostership = { add: false, drop: true, hold: false };
        break;
    }

    return impact;
  }

  calculateProjectionAdjustment(injury: InjuryUpdate): number {
    switch (injury.newStatus) {
      case "active":
        return injury.practiceStatus === "full" ? 1.0 : 0.95;
      case "questionable":
        return injury.practiceStatus === "full" ? 0.85 :
               injury.practiceStatus === "limited" ? 0.65 : 0.35;
      case "doubtful":
        return 0.15;
      case "out":
      case "injured_reserve":
      case "suspended":
        return 0;
      case "pup":
        return 0;
      default:
        return 1.0;
    }
  }

  // ============================================================================
  // Polling & Updates
  // ============================================================================

  private async pollForUpdates(): Promise<void> {
    try {
      const since = this.lastPollTimestamp || Date.now() - this.config.pollIntervalMs! * 2;
      this.lastPollTimestamp = Date.now();

      // Fetch recent news
      const news = await this.fetchNews({ since, limit: 100 });

      // Fetch injury updates
      const injuries = await this.fetchInjuryReports();

      // Process and emit updates
      for (const item of news) {
        item.fantasyImpact = this.analyzeFantasyImpact(item);

        // Emit for high-impact news
        if (item.impact === "high") {
          this.emit("breaking_news", item);
        }

        // Notify subscribers
        const subscribers = this.getSubscribedUsers(item.playerId);
        if (subscribers.length > 0) {
          this.emit("player_news", { news: item, subscribers });
        }
      }

      // Check for injury status changes
      for (const report of injuries) {
        for (const injury of report.players) {
          const prevKey = `prev_injury_${injury.playerId}`;
          const prev = this.getFromCache(prevKey) as InjuryUpdate | null;

          if (prev && prev.newStatus !== injury.newStatus) {
            // Status changed
            this.emit("injury_update", {
              injury,
              previousStatus: prev.newStatus,
              subscribers: this.getSubscribedUsers(injury.playerId),
            });
          }

          this.setCache(prevKey, injury, 86400000); // 24hr cache for previous state
        }
      }

      this.emit("poll_complete", { newsCount: news.length, injuryCount: injuries.length });
    } catch (error) {
      this.emit("poll_error", error);
    }
  }

  // ============================================================================
  // Data Fetching (ESPN API)
  // ============================================================================

  private async fetchNews(filter: NewsFilter = {}): Promise<PlayerNews[]> {
    try {
      const url = `${this.config.espnBaseUrl}/news`;
      const response = await fetch(url, {
        headers: { "Accept": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status}`);
      }

      const data = await response.json();
      const articles = data.articles || [];

      const news: PlayerNews[] = articles.map((article: any) => ({
        id: article.id || `news_${Date.now()}_${Math.random()}`,
        playerId: article.athletes?.[0]?.id || "unknown",
        playerName: article.athletes?.[0]?.fullName || "Unknown",
        team: article.athletes?.[0]?.team?.abbreviation || "",
        position: article.athletes?.[0]?.position?.abbreviation || "",
        headline: article.headline || "",
        summary: article.description || article.story?.substring(0, 300) || "",
        source: "espn",
        category: this.categorizeArticle(article),
        impact: this.assessImpact(article),
        publishedAt: new Date(article.published || Date.now()).getTime(),
        url: article.links?.web?.href,
        relatedPlayerIds: (article.athletes || []).map((a: any) => a.id).filter(Boolean),
      }));

      // Apply filters
      let filtered = news;
      if (filter.playerIds?.length) {
        filtered = filtered.filter((n) => filter.playerIds!.includes(n.playerId));
      }
      if (filter.teams?.length) {
        filtered = filtered.filter((n) => filter.teams!.includes(n.team));
      }
      if (filter.categories?.length) {
        filtered = filtered.filter((n) => filter.categories!.includes(n.category));
      }
      if (filter.impact?.length) {
        filtered = filtered.filter((n) => filter.impact!.includes(n.impact));
      }
      if (filter.since) {
        filtered = filtered.filter((n) => n.publishedAt >= filter.since!);
      }

      return filtered.slice(0, filter.limit || 50);
    } catch (error) {
      this.emit("fetch_error", { source: "news", error });
      return [];
    }
  }

  private async fetchInjuryReports(team?: string, week?: number): Promise<InjuryReport[]> {
    try {
      const url = `${this.config.espnBaseUrl}/injuries`;
      const response = await fetch(url, {
        headers: { "Accept": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`ESPN injury API error: ${response.status}`);
      }

      const data = await response.json();
      const teams = data.resultSets || data.teams || [];

      const reports: InjuryReport[] = teams
        .filter((t: any) => !team || t.team?.abbreviation === team)
        .map((t: any) => ({
          team: t.team?.abbreviation || "",
          week: week || 0,
          updatedAt: Date.now(),
          players: (t.injuries || []).map((inj: any) => ({
            playerId: inj.athlete?.id || "",
            playerName: inj.athlete?.fullName || "",
            team: t.team?.abbreviation || "",
            position: inj.athlete?.position?.abbreviation || "",
            previousStatus: "unknown",
            newStatus: this.mapInjuryStatus(inj.status),
            bodyPart: inj.details?.type || inj.details?.location,
            description: inj.longComment || inj.shortComment || "",
            estimatedReturn: inj.details?.returnDate,
            practiceStatus: this.mapPracticeStatus(inj.details?.fantasyStatus?.description),
            updatedAt: Date.now(),
            source: "espn",
            gameImpact: {
              week: week || 0,
              likelihood: this.getPlayLikelihood(inj.status),
              projectionAdjustment: this.getProjectionAdjustment(inj.status),
            },
          })),
        }));

      return reports;
    } catch (error) {
      this.emit("fetch_error", { source: "injuries", error });
      return [];
    }
  }

  private async fetchPlayerInjury(playerId: string): Promise<InjuryUpdate | null> {
    const reports = await this.fetchInjuryReports();
    for (const report of reports) {
      const injury = report.players.find((p) => p.playerId === playerId);
      if (injury) return injury;
    }
    return null;
  }

  // ============================================================================
  // Categorization Helpers
  // ============================================================================

  private categorizeArticle(article: any): PlayerNews["category"] {
    const text = `${article.headline || ""} ${article.description || ""}`.toLowerCase();

    if (text.includes("injur") || text.includes("hurt") || text.includes("concussion") ||
        text.includes("acl") || text.includes("hamstring") || text.includes("ankle")) {
      return "injury";
    }
    if (text.includes("trade") || text.includes("sign") || text.includes("release") ||
        text.includes("waiv") || text.includes("cut")) {
      return "transaction";
    }
    if (text.includes("depth chart") || text.includes("starter") || text.includes("backup") ||
        text.includes("promoted") || text.includes("demoted")) {
      return "depth_chart";
    }
    if (text.includes("suspend") || text.includes("banned") || text.includes("fine")) {
      return "suspension";
    }
    if (text.includes("yards") || text.includes("touchdown") || text.includes("target") ||
        text.includes("snap") || text.includes("reception")) {
      return "performance";
    }
    return "general";
  }

  private assessImpact(article: any): PlayerNews["impact"] {
    const text = `${article.headline || ""} ${article.description || ""}`.toLowerCase();

    // High impact keywords
    if (text.includes("acl") || text.includes("season-ending") || text.includes("out for season") ||
        text.includes("traded") || text.includes("released") || text.includes("starter") ||
        text.includes("suspended") || text.includes("arrested")) {
      return "high";
    }

    // Medium impact
    if (text.includes("questionable") || text.includes("limited") || text.includes("game-time") ||
        text.includes("concussion") || text.includes("expected to miss") || text.includes("breakout")) {
      return "medium";
    }

    return "low";
  }

  private mapInjuryStatus(status: string): InjuryUpdate["newStatus"] {
    const s = (status || "").toLowerCase();
    if (s.includes("out")) return "out";
    if (s.includes("doubtful")) return "doubtful";
    if (s.includes("questionable")) return "questionable";
    if (s.includes("injured reserve") || s.includes("ir")) return "injured_reserve";
    if (s.includes("pup")) return "pup";
    if (s.includes("suspend")) return "suspended";
    return "active";
  }

  private mapPracticeStatus(status?: string): InjuryUpdate["practiceStatus"] {
    if (!status) return undefined;
    const s = status.toLowerCase();
    if (s.includes("full")) return "full";
    if (s.includes("limited")) return "limited";
    if (s.includes("did not") || s.includes("dnp")) return "dnp";
    return undefined;
  }

  private getPlayLikelihood(status: string): number {
    const s = (status || "").toLowerCase();
    if (s.includes("active") || s.includes("probable")) return 0.95;
    if (s.includes("questionable")) return 0.60;
    if (s.includes("doubtful")) return 0.15;
    if (s.includes("out") || s.includes("ir")) return 0;
    return 0.80;
  }

  private getProjectionAdjustment(status: string): number {
    const s = (status || "").toLowerCase();
    if (s.includes("active") || s.includes("probable")) return 1.0;
    if (s.includes("questionable")) return 0.75;
    if (s.includes("doubtful")) return 0.15;
    if (s.includes("out") || s.includes("ir")) return 0;
    return 0.9;
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  private getFromCache(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache(key: string, data: any, ttl?: number): void {
    // Evict if too large
    if (this.cache.size >= this.config.maxCacheSize!) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttl || this.config.cacheTimeMs!),
    });
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================================================
// Export
// ============================================================================

let instance: PlayerNewsFeedService | null = null;

export function getPlayerNewsFeedService(config?: ConstructorParameters<typeof PlayerNewsFeedService>[0]): PlayerNewsFeedService {
  if (!instance) {
    instance = new PlayerNewsFeedService(config);
  }
  return instance;
}
