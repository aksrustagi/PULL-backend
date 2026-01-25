/**
 * Watch Party Game Sync
 * Synchronize game state across party members
 */

import {
  WatchParty,
  GameSyncState,
  GameStats,
  GamePlay,
  LiveOdds,
  PartyMember,
  SyncStatus,
  SyncStateParams,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface SyncConfig {
  syncIntervalMs: number;
  maxLatencyMs: number;
  reconnectAttempts: number;
  reconnectDelayMs: number;
  statsCacheMs: number;
}

const DEFAULT_CONFIG: SyncConfig = {
  syncIntervalMs: 1000,
  maxLatencyMs: 3000,
  reconnectAttempts: 5,
  reconnectDelayMs: 2000,
  statsCacheMs: 5000,
};

// ============================================================================
// Game Sync Manager
// ============================================================================

export class GameSyncManager {
  private config: SyncConfig;
  private activeSyncs: Map<string, GameSyncState>;
  private syncIntervals: Map<string, NodeJS.Timeout>;
  private memberSyncStatus: Map<string, Map<string, SyncStatus>>;

  constructor(config?: Partial<SyncConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.activeSyncs = new Map();
    this.syncIntervals = new Map();
    this.memberSyncStatus = new Map();
  }

  // ==========================================================================
  // Sync State Management
  // ==========================================================================

  /**
   * Start syncing for a party
   */
  async startSync(params: SyncStateParams): Promise<GameSyncState> {
    const { partyId, eventId } = params;

    // Initialize sync state
    const syncState: GameSyncState = {
      partyId,
      eventId,
      status: "pre_game",
      period: "",
      gameTime: "0:00",
      gameClockRunning: false,
      homeScore: 0,
      awayScore: 0,
      lastScoreUpdate: new Date(),
      currentStats: {
        eventId,
        period: "",
        homeStats: {},
        awayStats: {},
        updatedAt: new Date(),
      },
      recentPlays: [],
      liveOdds: {
        eventId,
        markets: [],
        updatedAt: new Date(),
      },
      lastSyncAt: new Date(),
      syncSource: "primary",
      latencyMs: 0,
    };

    this.activeSyncs.set(partyId, syncState);
    this.memberSyncStatus.set(partyId, new Map());

    // Start periodic sync
    const interval = setInterval(
      () => this.performSync(partyId),
      this.config.syncIntervalMs
    );
    this.syncIntervals.set(partyId, interval);

    return syncState;
  }

  /**
   * Stop syncing for a party
   */
  stopSync(partyId: string): void {
    const interval = this.syncIntervals.get(partyId);
    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(partyId);
    }
    this.activeSyncs.delete(partyId);
    this.memberSyncStatus.delete(partyId);
  }

  /**
   * Get current sync state
   */
  getSyncState(partyId: string): GameSyncState | null {
    return this.activeSyncs.get(partyId) || null;
  }

  /**
   * Perform sync update
   */
  private async performSync(partyId: string): Promise<void> {
    const currentState = this.activeSyncs.get(partyId);
    if (!currentState) return;

    const startTime = Date.now();

    try {
      // Fetch latest game data (would call external API)
      const gameData = await this.fetchGameData(currentState.eventId);

      // Update sync state
      const updatedState: GameSyncState = {
        ...currentState,
        ...gameData,
        lastSyncAt: new Date(),
        latencyMs: Date.now() - startTime,
      };

      this.activeSyncs.set(partyId, updatedState);

      // Broadcast to connected clients
      await this.broadcastSyncUpdate(partyId, updatedState);
    } catch (error) {
      console.error(`Sync error for party ${partyId}:`, error);
    }
  }

  // ==========================================================================
  // Game Data Fetching
  // ==========================================================================

  /**
   * Fetch game data from source
   */
  private async fetchGameData(eventId: string): Promise<Partial<GameSyncState>> {
    // This would call actual sports data API
    // Simplified mock implementation
    return {
      status: "in_progress",
      period: "2nd Half",
      gameTime: "65:30",
      gameClockRunning: true,
      homeScore: 2,
      awayScore: 1,
      lastScoreUpdate: new Date(),
    };
  }

  /**
   * Fetch live stats
   */
  async fetchLiveStats(eventId: string): Promise<GameStats> {
    // Would call stats API
    return {
      eventId,
      period: "2nd Half",
      homeStats: {
        possession: 55,
        shots: 12,
        shotsOnTarget: 5,
        corners: 6,
        fouls: 8,
      },
      awayStats: {
        possession: 45,
        shots: 8,
        shotsOnTarget: 3,
        corners: 4,
        fouls: 10,
      },
      updatedAt: new Date(),
    };
  }

  /**
   * Fetch recent plays
   */
  async fetchRecentPlays(eventId: string, limit: number = 10): Promise<GamePlay[]> {
    // Would call plays API
    return [];
  }

  /**
   * Fetch live odds
   */
  async fetchLiveOdds(eventId: string): Promise<LiveOdds> {
    // Would call odds API
    return {
      eventId,
      markets: [
        {
          marketId: "1x2",
          marketName: "Match Result",
          selections: [
            { selectionId: "home", name: "Home", odds: 1.5, movement: "stable" },
            { selectionId: "draw", name: "Draw", odds: 4.0, movement: "up" },
            { selectionId: "away", name: "Away", odds: 6.5, movement: "down" },
          ],
        },
      ],
      updatedAt: new Date(),
    };
  }

  // ==========================================================================
  // Member Sync Status
  // ==========================================================================

  /**
   * Update member sync status
   */
  updateMemberSyncStatus(
    partyId: string,
    userId: string,
    status: SyncStatus
  ): void {
    const partyStatus = this.memberSyncStatus.get(partyId);
    if (partyStatus) {
      partyStatus.set(userId, status);
    }
  }

  /**
   * Get member sync status
   */
  getMemberSyncStatus(partyId: string, userId: string): SyncStatus {
    const partyStatus = this.memberSyncStatus.get(partyId);
    return partyStatus?.get(userId) || "disconnected";
  }

  /**
   * Get all member sync statuses
   */
  getAllMemberSyncStatuses(partyId: string): Map<string, SyncStatus> {
    return this.memberSyncStatus.get(partyId) || new Map();
  }

  /**
   * Calculate sync health for party
   */
  calculateSyncHealth(partyId: string): {
    syncedCount: number;
    totalCount: number;
    healthPercent: number;
    averageLatency: number;
  } {
    const statuses = this.getAllMemberSyncStatuses(partyId);
    const total = statuses.size;
    let synced = 0;

    for (const status of statuses.values()) {
      if (status === "synced") synced++;
    }

    const state = this.getSyncState(partyId);
    const avgLatency = state?.latencyMs || 0;

    return {
      syncedCount: synced,
      totalCount: total,
      healthPercent: total > 0 ? (synced / total) * 100 : 0,
      averageLatency: avgLatency,
    };
  }

  // ==========================================================================
  // Sync Commands
  // ==========================================================================

  /**
   * Request all members to resync
   */
  async requestResync(partyId: string): Promise<void> {
    const state = this.getSyncState(partyId);
    if (state) {
      await this.broadcastSyncUpdate(partyId, state);
    }
  }

  /**
   * Pause sync for a party
   */
  pauseSync(partyId: string): void {
    const interval = this.syncIntervals.get(partyId);
    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(partyId);
    }
  }

  /**
   * Resume sync for a party
   */
  resumeSync(partyId: string): void {
    if (!this.syncIntervals.has(partyId) && this.activeSyncs.has(partyId)) {
      const interval = setInterval(
        () => this.performSync(partyId),
        this.config.syncIntervalMs
      );
      this.syncIntervals.set(partyId, interval);
    }
  }

  // ==========================================================================
  // Broadcasting
  // ==========================================================================

  /**
   * Broadcast sync update to all party members
   */
  private async broadcastSyncUpdate(
    partyId: string,
    state: GameSyncState
  ): Promise<void> {
    // This would use WebSocket or similar real-time transport
    // Implementation depends on the real-time infrastructure
    console.log(`Broadcasting sync update to party ${partyId}`, state.gameTime);
  }

  /**
   * Broadcast score update
   */
  async broadcastScoreUpdate(
    partyId: string,
    homeScore: number,
    awayScore: number
  ): Promise<void> {
    const state = this.getSyncState(partyId);
    if (state) {
      state.homeScore = homeScore;
      state.awayScore = awayScore;
      state.lastScoreUpdate = new Date();
      await this.broadcastSyncUpdate(partyId, state);
    }
  }

  /**
   * Broadcast play update
   */
  async broadcastPlay(partyId: string, play: GamePlay): Promise<void> {
    const state = this.getSyncState(partyId);
    if (state) {
      state.recentPlays = [play, ...state.recentPlays.slice(0, 9)];
      await this.broadcastSyncUpdate(partyId, state);
    }
  }
}

// ============================================================================
// Sync Utilities
// ============================================================================

/**
 * Calculate time difference between two sync states
 */
export function calculateSyncDelta(
  masterTime: string,
  memberTime: string
): number {
  // Parse time strings (MM:SS format)
  const parseTime = (time: string): number => {
    const [minutes, seconds] = time.split(":").map(Number);
    return minutes * 60 + seconds;
  };

  return parseTime(masterTime) - parseTime(memberTime);
}

/**
 * Determine sync status based on delta
 */
export function determineSyncStatus(
  deltaSeconds: number,
  tolerance: number
): SyncStatus {
  if (Math.abs(deltaSeconds) <= tolerance) {
    return "synced";
  } else if (deltaSeconds > tolerance) {
    return "behind";
  } else {
    return "ahead";
  }
}

// Export singleton instance
export const gameSyncManager = new GameSyncManager();
