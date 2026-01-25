/**
 * NUCLEAR GROWTH FEATURE #4: Cash Battles
 *
 * Real-time 1v1 and multiplayer betting duels with instant payouts.
 * Like heads-up poker but for sports betting.
 *
 * WHY IT'S NUCLEAR:
 * - PvP creates adrenaline addiction
 * - Instant gratification loop
 * - Ego drives return users
 * - Natural viral loop (challenge friends)
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const BattleModeSchema = z.enum([
  "heads_up",           // 1v1 duel
  "triple_threat",      // 3-way battle
  "battle_royale",      // 4-8 players
  "tournament",         // Bracket elimination
  "king_of_hill",       // Defend your spot
  "last_man_standing",  // Elimination rounds
]);

export type BattleMode = z.infer<typeof BattleModeSchema>;

export const BattleFormatSchema = z.enum([
  "single_pick",        // One pick decides it
  "best_of_3",          // First to 2 wins
  "best_of_5",          // First to 3 wins
  "timed_sprint",       // Most wins in X minutes
  "profit_race",        // Most profit in period
  "parlay_showdown",    // Biggest parlay wins
]);

export type BattleFormat = z.infer<typeof BattleFormatSchema>;

export interface CashBattle {
  id: string;
  mode: BattleMode;
  format: BattleFormat;

  // Stakes
  entryFee: number;
  prizePool: number;
  rake: number; // Platform fee

  // Players
  players: BattlePlayer[];
  maxPlayers: number;
  minPlayers: number;

  // Game context
  sport?: string;
  league?: string;
  gameId?: string;
  markets?: string[]; // Allowed markets

  // Rules
  rules: BattleRules;

  // State
  currentRound: number;
  totalRounds: number;
  picks: BattlePick[];

  // Results
  winner?: string;
  standings: BattleStanding[];

  // Timing
  status: "waiting" | "picking" | "locked" | "resolving" | "complete" | "cancelled";
  pickDeadline?: number;
  startedAt?: number;
  endedAt?: number;
  createdAt: number;

  // Chat
  chatEnabled: boolean;
  spectators: number;
}

export interface BattlePlayer {
  userId: string;
  username: string;
  avatarUrl?: string;
  elo: number;
  tier: BattleTier;

  // Battle state
  score: number;
  wins: number;
  losses: number;
  currentPick?: BattlePick;
  isReady: boolean;
  isEliminated: boolean;

  // Stats
  lifetimeBattles: number;
  lifetimeWins: number;
  winStreak: number;
}

export type BattleTier = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "master" | "grandmaster";

export interface BattleRules {
  pickTimeSeconds: number;
  minOdds?: number;
  maxOdds?: number;
  allowParlays: boolean;
  maxLegs?: number;
  allowLive: boolean;
  requireSameGame: boolean; // Both must pick from same game
  blindPicks: boolean; // Can't see opponent's pick until locked
}

export interface BattlePick {
  oduserId: string;
  odusername: string;
  round: number;

  // Pick details
  gameId: string;
  market: string;
  selection: string;
  odds: number;
  isParlay: boolean;
  legs?: ParlayLeg[];

  // Result
  result?: "win" | "loss" | "push" | "pending";
  lockedAt: number;
  settledAt?: number;
}

export interface ParlayLeg {
  gameId: string;
  market: string;
  selection: string;
  odds: number;
  result?: "win" | "loss" | "push" | "pending";
}

export interface BattleStanding {
  oduserId: string;
  odusername: string;
  position: number;
  score: number;
  wins: number;
  losses: number;
  profit: number;
  payout: number;
}

export interface BattleChallenge {
  id: string;
  challengerId: string;
  challengerUsername: string;
  challengedId: string;
  challengedUsername: string;

  // Battle config
  mode: BattleMode;
  format: BattleFormat;
  entryFee: number;
  rules: BattleRules;

  // Status
  status: "pending" | "accepted" | "declined" | "expired";
  message?: string;
  expiresAt: number;
  createdAt: number;
}

export interface BattleQueue {
  mode: BattleMode;
  format: BattleFormat;
  entryFee: number;
  players: QueuedPlayer[];
  estimatedWait: number;
}

export interface QueuedPlayer {
  oduserId: string;
  odusername: string;
  elo: number;
  joinedAt: number;
  eloRange: { min: number; max: number };
}

export interface BattleElo {
  oduserId: string;
  rating: number;
  tier: BattleTier;
  gamesPlayed: number;
  wins: number;
  losses: number;
  peakRating: number;
  currentStreak: number;
  bestStreak: number;
}

export interface BattleTournament {
  id: string;
  name: string;
  description?: string;

  // Config
  entryFee: number;
  prizePool: number;
  maxPlayers: number;
  format: BattleFormat;
  rules: BattleRules;

  // Bracket
  bracket: TournamentBracket;

  // Timing
  registrationEnds: number;
  startsAt: number;
  status: "registration" | "in_progress" | "complete";

  // Prize distribution
  payouts: Array<{ place: number; amount: number; percentage: number }>;
}

export interface TournamentBracket {
  rounds: TournamentRound[];
  currentRound: number;
}

export interface TournamentRound {
  roundNumber: number;
  name: string; // "Round of 16", "Quarter Finals", etc.
  matches: TournamentMatch[];
  status: "pending" | "active" | "complete";
}

export interface TournamentMatch {
  id: string;
  player1?: string;
  player2?: string;
  winner?: string;
  battleId?: string;
  status: "pending" | "active" | "complete" | "bye";
}

// ============================================================================
// ELO TIERS
// ============================================================================

export const ELO_TIERS: Record<BattleTier, { min: number; max: number; name: string; icon: string }> = {
  bronze: { min: 0, max: 999, name: "Bronze", icon: "🥉" },
  silver: { min: 1000, max: 1199, name: "Silver", icon: "🥈" },
  gold: { min: 1200, max: 1399, name: "Gold", icon: "🥇" },
  platinum: { min: 1400, max: 1599, name: "Platinum", icon: "💎" },
  diamond: { min: 1600, max: 1799, name: "Diamond", icon: "💠" },
  master: { min: 1800, max: 1999, name: "Master", icon: "👑" },
  grandmaster: { min: 2000, max: Infinity, name: "Grandmaster", icon: "🏆" },
};

// ============================================================================
// CASH BATTLES SERVICE
// ============================================================================

export class CashBattlesService {
  private readonly BASE_ELO = 1000;
  private readonly K_FACTOR = 32;

  /**
   * Create a battle
   */
  createBattle(
    creator: { userId: string; username: string; elo: number },
    config: {
      mode: BattleMode;
      format: BattleFormat;
      entryFee: number;
      rules?: Partial<BattleRules>;
      sport?: string;
      league?: string;
      gameId?: string;
    }
  ): CashBattle {
    const defaultRules: BattleRules = {
      pickTimeSeconds: 60,
      allowParlays: false,
      allowLive: true,
      requireSameGame: false,
      blindPicks: true,
    };

    const maxPlayers = this.getMaxPlayers(config.mode);
    const minPlayers = this.getMinPlayers(config.mode);
    const rake = config.entryFee * 0.1; // 10% rake

    return {
      id: `battle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      mode: config.mode,
      format: config.format,
      entryFee: config.entryFee,
      prizePool: config.entryFee * maxPlayers * 0.9,
      rake,
      players: [{
        oduserId: creator.userId,
        odusername: creator.username,
        elo: creator.elo,
        tier: this.getTierFromElo(creator.elo),
        score: 0,
        wins: 0,
        losses: 0,
        isReady: true,
        isEliminated: false,
        lifetimeBattles: 0,
        lifetimeWins: 0,
        winStreak: 0,
      }],
      maxPlayers,
      minPlayers,
      sport: config.sport,
      league: config.league,
      gameId: config.gameId,
      rules: { ...defaultRules, ...config.rules },
      currentRound: 0,
      totalRounds: this.getTotalRounds(config.format),
      picks: [],
      standings: [],
      status: "waiting",
      createdAt: Date.now(),
      chatEnabled: true,
      spectators: 0,
    };
  }

  /**
   * Join a battle
   */
  joinBattle(
    battle: CashBattle,
    player: { userId: string; username: string; elo: number }
  ): { battle: CashBattle; error?: string } {
    if (battle.players.length >= battle.maxPlayers) {
      return { battle, error: "Battle is full" };
    }

    if (battle.status !== "waiting") {
      return { battle, error: "Battle already started" };
    }

    if (battle.players.some(p => p.oduserId === player.userId)) {
      return { battle, error: "Already in battle" };
    }

    const newPlayer: BattlePlayer = {
      oduserId: player.userId,
      odusername: player.username,
      elo: player.elo,
      tier: this.getTierFromElo(player.elo),
      score: 0,
      wins: 0,
      losses: 0,
      isReady: false,
      isEliminated: false,
      lifetimeBattles: 0,
      lifetimeWins: 0,
      winStreak: 0,
    };

    const updatedBattle: CashBattle = {
      ...battle,
      players: [...battle.players, newPlayer],
      prizePool: (battle.players.length + 1) * battle.entryFee * 0.9,
    };

    // Auto-start if full
    if (updatedBattle.players.length >= updatedBattle.maxPlayers) {
      return { battle: this.startBattle(updatedBattle) };
    }

    return { battle: updatedBattle };
  }

  /**
   * Start battle
   */
  startBattle(battle: CashBattle): CashBattle {
    return {
      ...battle,
      status: "picking",
      currentRound: 1,
      startedAt: Date.now(),
      pickDeadline: Date.now() + (battle.rules.pickTimeSeconds * 1000),
    };
  }

  /**
   * Submit pick
   */
  submitPick(
    battle: CashBattle,
    userId: string,
    pick: Omit<BattlePick, "oduserId" | "odusername" | "round" | "lockedAt">
  ): { battle: CashBattle; error?: string } {
    if (battle.status !== "picking") {
      return { battle, error: "Not in picking phase" };
    }

    const player = battle.players.find(p => p.oduserId === oduserId);
    if (!player) {
      return { battle, error: "Not in battle" };
    }

    // Validate odds
    if (battle.rules.minOdds && pick.odds < battle.rules.minOdds) {
      return { battle, error: `Minimum odds: ${battle.rules.minOdds}` };
    }
    if (battle.rules.maxOdds && pick.odds > battle.rules.maxOdds) {
      return { battle, error: `Maximum odds: ${battle.rules.maxOdds}` };
    }

    const battlePick: BattlePick = {
      ...pick,
      oduserId: oduserId,
      odusername: player.odusername,
      round: battle.currentRound,
      lockedAt: Date.now(),
    };

    const updatedBattle: CashBattle = {
      ...battle,
      picks: [...battle.picks, battlePick],
      players: battle.players.map(p =>
        p.oduserId === oduserId ? { ...p, currentPick: battlePick, isReady: true } : p
      ),
    };

    // Check if all players have picked
    if (updatedBattle.players.every(p => p.isReady)) {
      return { battle: this.lockPicks(updatedBattle) };
    }

    return { battle: updatedBattle };
  }

  /**
   * Lock picks and wait for results
   */
  lockPicks(battle: CashBattle): CashBattle {
    return {
      ...battle,
      status: "locked",
      players: battle.players.map(p => ({ ...p, isReady: false })),
    };
  }

  /**
   * Resolve round
   */
  resolveRound(
    battle: CashBattle,
    results: Array<{ oduserId: string; result: "win" | "loss" | "push" }>
  ): CashBattle {
    let updatedPlayers = battle.players.map(player => {
      const result = results.find(r => r.oduserId === player.oduserId);
      if (!result) return player;

      return {
        ...player,
        wins: result.result === "win" ? player.wins + 1 : player.wins,
        losses: result.result === "loss" ? player.losses + 1 : player.losses,
        score: this.calculateScore(player.score, result.result),
        currentPick: undefined,
      };
    });

    // Check for battle completion
    const isComplete = this.checkBattleComplete(battle, updatedPlayers);

    if (isComplete) {
      return this.completeBattle({
        ...battle,
        players: updatedPlayers,
      });
    }

    // Start next round
    return {
      ...battle,
      players: updatedPlayers,
      currentRound: battle.currentRound + 1,
      status: "picking",
      pickDeadline: Date.now() + (battle.rules.pickTimeSeconds * 1000),
    };
  }

  /**
   * Complete battle
   */
  completeBattle(battle: CashBattle): CashBattle {
    const standings = this.calculateStandings(battle);
    const winner = standings[0]?.oduserId;

    return {
      ...battle,
      status: "complete",
      winner,
      standings,
      endedAt: Date.now(),
    };
  }

  /**
   * Calculate ELO change
   */
  calculateEloChange(
    winnerElo: number,
    loserElo: number
  ): { winnerGain: number; loserLoss: number } {
    const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
    const expectedLoser = 1 - expectedWinner;

    const winnerGain = Math.round(this.K_FACTOR * (1 - expectedWinner));
    const loserLoss = Math.round(this.K_FACTOR * expectedLoser);

    return { winnerGain, loserLoss };
  }

  /**
   * Create challenge
   */
  createChallenge(
    challenger: { userId: string; username: string },
    challenged: { userId: string; username: string },
    config: {
      mode: BattleMode;
      format: BattleFormat;
      entryFee: number;
      rules?: Partial<BattleRules>;
      message?: string;
    }
  ): BattleChallenge {
    return {
      id: `challenge_${Date.now()}`,
      challengerId: challenger.userId,
      challengerUsername: challenger.username,
      challengedId: challenged.userId,
      challengedUsername: challenged.username,
      mode: config.mode,
      format: config.format,
      entryFee: config.entryFee,
      rules: {
        pickTimeSeconds: 60,
        allowParlays: false,
        allowLive: true,
        requireSameGame: false,
        blindPicks: true,
        ...config.rules,
      },
      status: "pending",
      message: config.message,
      expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      createdAt: Date.now(),
    };
  }

  /**
   * Get available battle pools
   */
  getAvailablePools(): Array<{
    mode: BattleMode;
    format: BattleFormat;
    entryFees: number[];
    description: string;
  }> {
    return [
      {
        mode: "heads_up",
        format: "single_pick",
        entryFees: [1, 5, 10, 25, 50, 100],
        description: "1v1 single pick showdown",
      },
      {
        mode: "heads_up",
        format: "best_of_3",
        entryFees: [5, 10, 25, 50, 100],
        description: "1v1 best of 3 series",
      },
      {
        mode: "triple_threat",
        format: "timed_sprint",
        entryFees: [5, 10, 25],
        description: "3-way 15-minute sprint",
      },
      {
        mode: "battle_royale",
        format: "profit_race",
        entryFees: [10, 25, 50],
        description: "8-player profit race",
      },
      {
        mode: "heads_up",
        format: "parlay_showdown",
        entryFees: [10, 25, 50, 100],
        description: "1v1 parlay builder",
      },
    ];
  }

  /**
   * Create tournament
   */
  createTournament(
    name: string,
    config: {
      entryFee: number;
      maxPlayers: 8 | 16 | 32 | 64;
      format: BattleFormat;
      rules?: Partial<BattleRules>;
      startsAt: number;
    }
  ): BattleTournament {
    const prizePool = config.entryFee * config.maxPlayers * 0.9;

    // Standard payout structure
    const payouts = this.getTournamentPayouts(config.maxPlayers, prizePool);

    // Generate bracket
    const rounds = Math.log2(config.maxPlayers);
    const bracket: TournamentBracket = {
      rounds: Array.from({ length: rounds }, (_, i) => ({
        roundNumber: i + 1,
        name: this.getRoundName(i + 1, rounds),
        matches: [],
        status: "pending" as const,
      })),
      currentRound: 0,
    };

    return {
      id: `tournament_${Date.now()}`,
      name,
      entryFee: config.entryFee,
      prizePool,
      maxPlayers: config.maxPlayers,
      format: config.format,
      rules: {
        pickTimeSeconds: 90,
        allowParlays: false,
        allowLive: true,
        requireSameGame: false,
        blindPicks: true,
        ...config.rules,
      },
      bracket,
      registrationEnds: config.startsAt - (30 * 60 * 1000), // 30 min before
      startsAt: config.startsAt,
      status: "registration",
      payouts,
    };
  }

  private getTierFromElo(elo: number): BattleTier {
    for (const [tier, range] of Object.entries(ELO_TIERS)) {
      if (elo >= range.min && elo <= range.max) {
        return tier as BattleTier;
      }
    }
    return "bronze";
  }

  private getMaxPlayers(mode: BattleMode): number {
    const max: Record<BattleMode, number> = {
      heads_up: 2,
      triple_threat: 3,
      battle_royale: 8,
      tournament: 64,
      king_of_hill: 2,
      last_man_standing: 8,
    };
    return max[mode];
  }

  private getMinPlayers(mode: BattleMode): number {
    const min: Record<BattleMode, number> = {
      heads_up: 2,
      triple_threat: 3,
      battle_royale: 4,
      tournament: 4,
      king_of_hill: 2,
      last_man_standing: 4,
    };
    return min[mode];
  }

  private getTotalRounds(format: BattleFormat): number {
    const rounds: Record<BattleFormat, number> = {
      single_pick: 1,
      best_of_3: 3,
      best_of_5: 5,
      timed_sprint: 1,
      profit_race: 1,
      parlay_showdown: 1,
    };
    return rounds[format];
  }

  private calculateScore(currentScore: number, result: "win" | "loss" | "push"): number {
    if (result === "win") return currentScore + 1;
    if (result === "loss") return currentScore - 1;
    return currentScore;
  }

  private checkBattleComplete(battle: CashBattle, players: BattlePlayer[]): boolean {
    const format = battle.format;

    if (format === "best_of_3") {
      return players.some(p => p.wins >= 2);
    }
    if (format === "best_of_5") {
      return players.some(p => p.wins >= 3);
    }
    if (format === "single_pick" || format === "parlay_showdown") {
      return battle.currentRound >= 1;
    }

    return battle.currentRound >= battle.totalRounds;
  }

  private calculateStandings(battle: CashBattle): BattleStanding[] {
    return battle.players
      .map((player, idx) => ({
        oduserId: player.oduserId,
        odusername: player.odusername,
        position: 0,
        score: player.score,
        wins: player.wins,
        losses: player.losses,
        profit: player.score * (battle.entryFee / 10),
        payout: 0,
      }))
      .sort((a, b) => b.score - a.score || b.wins - a.wins)
      .map((standing, idx) => ({
        ...standing,
        position: idx + 1,
        payout: idx === 0 ? battle.prizePool : 0,
      }));
  }

  private getTournamentPayouts(
    players: number,
    prizePool: number
  ): Array<{ place: number; amount: number; percentage: number }> {
    const structure: Record<number, number[]> = {
      8: [50, 25, 12.5, 12.5],
      16: [40, 20, 15, 15, 10],
      32: [35, 20, 12, 12, 7, 7, 7],
      64: [30, 18, 12, 12, 7, 7, 7, 7],
    };

    const percentages = structure[players] || [100];
    return percentages.map((pct, idx) => ({
      place: idx + 1,
      amount: Math.round(prizePool * (pct / 100)),
      percentage: pct,
    }));
  }

  private getRoundName(round: number, totalRounds: number): string {
    const remaining = totalRounds - round + 1;
    if (remaining === 1) return "Finals";
    if (remaining === 2) return "Semi-Finals";
    if (remaining === 3) return "Quarter-Finals";
    return `Round of ${Math.pow(2, remaining)}`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createCashBattlesService(): CashBattlesService {
  return new CashBattlesService();
}
