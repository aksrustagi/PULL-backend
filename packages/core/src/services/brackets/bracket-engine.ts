/**
 * Universal Bracket Engine
 *
 * Supports all bracket types across sports:
 * - NCAA Tournament (64-team single elimination)
 * - NBA Playoffs (16-team, best of 7)
 * - NFL Playoffs (14-team, single elimination)
 * - Golf Match Play (64-player single elimination)
 * - Head-to-Head Matchups (2-way brackets)
 */

import { z } from "zod";

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

export const BracketTypeSchema = z.enum([
  "ncaa_tournament",      // 64-team March Madness
  "ncaa_nit",             // NIT Tournament
  "nba_playoffs",         // 16-team NBA playoffs
  "nba_play_in",          // Play-in tournament
  "nfl_playoffs",         // 14-team NFL playoffs
  "mlb_playoffs",         // 12-team MLB playoffs
  "golf_match_play",      // WGC Match Play style
  "golf_head_to_head",    // H2H matchups
  "custom_tournament",    // User-created brackets
  "survivor_pool",        // Pick one winner per week
  "confidence_pool",      // Ranked confidence picks
]);

export type BracketType = z.infer<typeof BracketTypeSchema>;

export const BracketFormatSchema = z.enum([
  "single_elimination",
  "double_elimination",
  "best_of_3",
  "best_of_5",
  "best_of_7",
  "round_robin",
  "swiss",
]);

export type BracketFormat = z.infer<typeof BracketFormatSchema>;

export const ScoringSystemSchema = z.enum([
  "standard",            // 1-2-4-8-16-32 points per round
  "upset_bonus",         // Extra points for picking upsets
  "seed_weighted",       // Points based on seed differential
  "confidence",          // User assigns confidence points
  "progressive",         // Points double each round
  "fibonacci",           // 1-1-2-3-5-8-13 sequence
  "custom",              // Custom point values
]);

export type ScoringSystem = z.infer<typeof ScoringSystemSchema>;

export interface BracketConfig {
  type: BracketType;
  format: BracketFormat;
  scoringSystem: ScoringSystem;
  numTeams: number;
  numRounds: number;
  roundNames: string[];
  pointsPerRound: number[];
  upsetBonusMultiplier?: number;
  tiebreaker?: "total_points" | "champion_score" | "most_upsets" | "earliest_correct";
  allowLateEntries?: boolean;
  lockTime?: number;
  regions?: string[];
}

export interface BracketMatchup {
  id: string;
  round: number;
  position: number;
  region?: string;
  team1Id?: string;
  team2Id?: string;
  team1Seed?: number;
  team2Seed?: number;
  team1Name?: string;
  team2Name?: string;
  winnerId?: string;
  team1Score?: number;
  team2Score?: number;
  status: "pending" | "locked" | "in_progress" | "complete";
  scheduledAt?: number;
  completedAt?: number;
  nextMatchupId?: string;
}

export interface BracketPick {
  matchupId: string;
  round: number;
  pickedTeamId: string;
  confidence?: number; // 1-N for confidence pools
  isCorrect?: boolean;
  pointsEarned?: number;
}

export interface UserBracket {
  id: string;
  userId: string;
  bracketConfigId: string;
  poolId?: string;
  name: string;
  picks: BracketPick[];
  champion?: string;
  tiebreaker?: number;
  status: "draft" | "submitted" | "locked" | "scored";
  totalPoints: number;
  maxPossiblePoints: number;
  rank?: number;
  percentile?: number;
  createdAt: number;
  submittedAt?: number;
  updatedAt: number;
}

export interface BracketPool {
  id: string;
  name: string;
  description?: string;
  creatorId: string;
  bracketConfigId: string;
  inviteCode: string;
  isPublic: boolean;
  entryFee: number;
  entryFeeType: "credits" | "cash" | "free";
  prizePool: number;
  prizeDistribution: PrizeDistribution[];
  maxEntries: number;
  currentEntries: number;
  entriesPerUser: number;
  status: "open" | "locked" | "in_progress" | "complete" | "cancelled";
  bracketIds: string[];
  leaderboard?: LeaderboardEntry[];
  settings: PoolSettings;
  createdAt: number;
  lockTime: number;
  completedAt?: number;
}

export interface PoolSettings {
  allowLateEntries: boolean;
  showOtherPicks: "never" | "after_lock" | "after_round" | "always";
  notifications: boolean;
  chat: boolean;
  leaderboardVisibility: "public" | "private" | "anonymous_until_end";
}

export interface PrizeDistribution {
  place: number | string; // 1, 2, 3 or "4-10"
  percentage: number;
  amount?: number;
  prize?: string; // Could be merchandise, etc.
}

export interface LeaderboardEntry {
  rank: number;
  bracketId: string;
  userId: string;
  userName: string;
  bracketName: string;
  points: number;
  maxPossible: number;
  correctPicks: number;
  totalPicks: number;
  champion?: string;
  championAlive: boolean;
  lastUpdated: number;
}

// ============================================================================
// BRACKET CONFIGURATIONS
// ============================================================================

export const BRACKET_CONFIGS: Record<BracketType, BracketConfig> = {
  ncaa_tournament: {
    type: "ncaa_tournament",
    format: "single_elimination",
    scoringSystem: "progressive",
    numTeams: 64,
    numRounds: 6,
    roundNames: ["First Round", "Second Round", "Sweet 16", "Elite 8", "Final Four", "Championship"],
    pointsPerRound: [1, 2, 4, 8, 16, 32],
    upsetBonusMultiplier: 1.5,
    tiebreaker: "champion_score",
    regions: ["East", "West", "South", "Midwest"],
  },
  ncaa_nit: {
    type: "ncaa_nit",
    format: "single_elimination",
    scoringSystem: "standard",
    numTeams: 32,
    numRounds: 5,
    roundNames: ["First Round", "Second Round", "Quarterfinals", "Semifinals", "Championship"],
    pointsPerRound: [1, 2, 4, 8, 16],
    tiebreaker: "champion_score",
  },
  nba_playoffs: {
    type: "nba_playoffs",
    format: "best_of_7",
    scoringSystem: "standard",
    numTeams: 16,
    numRounds: 4,
    roundNames: ["First Round", "Conference Semifinals", "Conference Finals", "NBA Finals"],
    pointsPerRound: [2, 4, 8, 16],
    tiebreaker: "total_points",
    regions: ["Eastern Conference", "Western Conference"],
  },
  nba_play_in: {
    type: "nba_play_in",
    format: "single_elimination",
    scoringSystem: "standard",
    numTeams: 8,
    numRounds: 2,
    roundNames: ["7/8 & 9/10 Games", "Final Play-In"],
    pointsPerRound: [2, 4],
    regions: ["East", "West"],
  },
  nfl_playoffs: {
    type: "nfl_playoffs",
    format: "single_elimination",
    scoringSystem: "confidence",
    numTeams: 14,
    numRounds: 4,
    roundNames: ["Wild Card", "Divisional", "Conference Championships", "Super Bowl"],
    pointsPerRound: [1, 2, 4, 8],
    tiebreaker: "total_points",
    regions: ["AFC", "NFC"],
  },
  mlb_playoffs: {
    type: "mlb_playoffs",
    format: "best_of_5", // Varies by round
    scoringSystem: "standard",
    numTeams: 12,
    numRounds: 4,
    roundNames: ["Wild Card", "Division Series", "League Championship", "World Series"],
    pointsPerRound: [2, 4, 8, 16],
    tiebreaker: "total_points",
    regions: ["American League", "National League"],
  },
  golf_match_play: {
    type: "golf_match_play",
    format: "single_elimination",
    scoringSystem: "seed_weighted",
    numTeams: 64,
    numRounds: 6,
    roundNames: ["Round of 64", "Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Final"],
    pointsPerRound: [1, 2, 4, 8, 16, 32],
    upsetBonusMultiplier: 2,
    tiebreaker: "most_upsets",
  },
  golf_head_to_head: {
    type: "golf_head_to_head",
    format: "single_elimination",
    scoringSystem: "standard",
    numTeams: 2,
    numRounds: 1,
    roundNames: ["Matchup"],
    pointsPerRound: [1],
  },
  custom_tournament: {
    type: "custom_tournament",
    format: "single_elimination",
    scoringSystem: "standard",
    numTeams: 16,
    numRounds: 4,
    roundNames: ["Round 1", "Round 2", "Semifinals", "Final"],
    pointsPerRound: [1, 2, 4, 8],
  },
  survivor_pool: {
    type: "survivor_pool",
    format: "single_elimination",
    scoringSystem: "standard",
    numTeams: 32,
    numRounds: 17,
    roundNames: Array.from({ length: 17 }, (_, i) => `Week ${i + 1}`),
    pointsPerRound: Array(17).fill(1),
    tiebreaker: "earliest_correct",
  },
  confidence_pool: {
    type: "confidence_pool",
    format: "single_elimination",
    scoringSystem: "confidence",
    numTeams: 32,
    numRounds: 1,
    roundNames: ["Week"],
    pointsPerRound: [1],
  },
};

// ============================================================================
// BRACKET ENGINE
// ============================================================================

export class BracketEngine {
  private config: BracketConfig;

  constructor(config: BracketConfig) {
    this.config = config;
  }

  /**
   * Generate empty bracket structure
   */
  generateBracketStructure(teams: Array<{ id: string; name: string; seed: number }>): BracketMatchup[] {
    const matchups: BracketMatchup[] = [];
    let matchupId = 0;

    // First round matchups based on seeding
    const firstRoundMatchups = this.generateFirstRoundMatchups(teams);

    for (let round = 1; round <= this.config.numRounds; round++) {
      const matchupsInRound = Math.pow(2, this.config.numRounds - round);

      for (let position = 0; position < matchupsInRound; position++) {
        const matchup: BracketMatchup = {
          id: `matchup_${++matchupId}`,
          round,
          position,
          status: "pending",
        };

        // Assign teams for first round
        if (round === 1 && firstRoundMatchups[position]) {
          matchup.team1Id = firstRoundMatchups[position].team1.id;
          matchup.team1Name = firstRoundMatchups[position].team1.name;
          matchup.team1Seed = firstRoundMatchups[position].team1.seed;
          matchup.team2Id = firstRoundMatchups[position].team2.id;
          matchup.team2Name = firstRoundMatchups[position].team2.name;
          matchup.team2Seed = firstRoundMatchups[position].team2.seed;
        }

        // Assign region for regional brackets
        if (this.config.regions) {
          const regionIndex = Math.floor(position / (matchupsInRound / this.config.regions.length));
          matchup.region = this.config.regions[regionIndex];
        }

        // Link to next matchup
        if (round < this.config.numRounds) {
          const nextPosition = Math.floor(position / 2);
          matchup.nextMatchupId = `matchup_${matchupId + matchupsInRound - position + nextPosition}`;
        }

        matchups.push(matchup);
      }
    }

    return matchups;
  }

  /**
   * Generate first round matchups based on traditional seeding (1v16, 2v15, etc.)
   */
  private generateFirstRoundMatchups(
    teams: Array<{ id: string; name: string; seed: number }>
  ): Array<{ team1: typeof teams[0]; team2: typeof teams[0] }> {
    const sorted = [...teams].sort((a, b) => a.seed - b.seed);
    const matchups: Array<{ team1: typeof teams[0]; team2: typeof teams[0] }> = [];

    const numMatchups = teams.length / 2;
    for (let i = 0; i < numMatchups; i++) {
      matchups.push({
        team1: sorted[i],
        team2: sorted[teams.length - 1 - i],
      });
    }

    return matchups;
  }

  /**
   * Calculate points for a pick
   */
  calculatePoints(pick: BracketPick, matchup: BracketMatchup): number {
    if (!pick.isCorrect) return 0;

    const basePoints = this.config.pointsPerRound[pick.round - 1];

    switch (this.config.scoringSystem) {
      case "upset_bonus":
        // Bonus for picking lower seed
        if (matchup.team1Seed && matchup.team2Seed) {
          const pickedSeed = pick.pickedTeamId === matchup.team1Id ? matchup.team1Seed : matchup.team2Seed;
          const otherSeed = pick.pickedTeamId === matchup.team1Id ? matchup.team2Seed : matchup.team1Seed;
          if (pickedSeed > otherSeed) {
            return Math.round(basePoints * (this.config.upsetBonusMultiplier ?? 1.5));
          }
        }
        return basePoints;

      case "seed_weighted":
        // Points equal to seed of picked team
        if (matchup.team1Seed && matchup.team2Seed) {
          const pickedSeed = pick.pickedTeamId === matchup.team1Id ? matchup.team1Seed : matchup.team2Seed;
          return basePoints + pickedSeed;
        }
        return basePoints;

      case "confidence":
        // Points equal to confidence value assigned
        return pick.confidence ?? basePoints;

      case "progressive":
      case "standard":
      case "fibonacci":
      default:
        return basePoints;
    }
  }

  /**
   * Score an entire bracket
   */
  scoreBracket(bracket: UserBracket, matchups: BracketMatchup[]): UserBracket {
    let totalPoints = 0;
    let maxPossiblePoints = 0;
    const scoredPicks: BracketPick[] = [];

    for (const pick of bracket.picks) {
      const matchup = matchups.find(m => m.id === pick.matchupId);
      if (!matchup) continue;

      const isCorrect = matchup.status === "complete" && matchup.winnerId === pick.pickedTeamId;
      const pointsEarned = isCorrect ? this.calculatePoints({ ...pick, isCorrect }, matchup) : 0;

      totalPoints += pointsEarned;

      // Calculate max possible
      if (matchup.status !== "complete" || isCorrect) {
        maxPossiblePoints += this.config.pointsPerRound[pick.round - 1];
      }

      scoredPicks.push({
        ...pick,
        isCorrect,
        pointsEarned,
      });
    }

    return {
      ...bracket,
      picks: scoredPicks,
      totalPoints,
      maxPossiblePoints,
      status: "scored",
      updatedAt: Date.now(),
    };
  }

  /**
   * Calculate pool leaderboard
   */
  calculateLeaderboard(pool: BracketPool, brackets: UserBracket[], matchups: BracketMatchup[]): LeaderboardEntry[] {
    const championMatchup = matchups.find(m => m.round === this.config.numRounds);
    const championAlive = championMatchup?.status !== "complete";

    const entries: LeaderboardEntry[] = brackets.map(bracket => {
      const correctPicks = bracket.picks.filter(p => p.isCorrect).length;
      const bracketChampionAlive = !championMatchup?.winnerId ||
        championMatchup.team1Id === bracket.champion ||
        championMatchup.team2Id === bracket.champion;

      return {
        rank: 0,
        bracketId: bracket.id,
        userId: bracket.userId,
        userName: "", // Filled in by caller
        bracketName: bracket.name,
        points: bracket.totalPoints,
        maxPossible: bracket.maxPossiblePoints,
        correctPicks,
        totalPicks: bracket.picks.length,
        champion: bracket.champion,
        championAlive: bracketChampionAlive,
        lastUpdated: bracket.updatedAt,
      };
    });

    // Sort by points (desc), then max possible (desc), then by tiebreaker
    entries.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.maxPossible !== a.maxPossible) return b.maxPossible - a.maxPossible;
      return 0;
    });

    // Assign ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return entries;
  }

  /**
   * Distribute prizes based on final standings
   */
  distributePrizes(pool: BracketPool, leaderboard: LeaderboardEntry[]): Array<{
    userId: string;
    place: number;
    amount: number;
    prize?: string;
  }> {
    const distributions: Array<{
      userId: string;
      place: number;
      amount: number;
      prize?: string;
    }> = [];

    for (const dist of pool.prizeDistribution) {
      const places = typeof dist.place === "string"
        ? this.parsePlaceRange(dist.place)
        : [dist.place];

      for (const place of places) {
        const winner = leaderboard.find(e => e.rank === place);
        if (winner) {
          distributions.push({
            userId: winner.userId,
            place,
            amount: dist.amount ?? (pool.prizePool * dist.percentage / 100 / places.length),
            prize: dist.prize,
          });
        }
      }
    }

    return distributions;
  }

  private parsePlaceRange(range: string): number[] {
    const [start, end] = range.split("-").map(Number);
    const places: number[] = [];
    for (let i = start; i <= end; i++) {
      places.push(i);
    }
    return places;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createBracketEngine(type: BracketType): BracketEngine {
  const config = BRACKET_CONFIGS[type];
  if (!config) {
    throw new Error(`Unknown bracket type: ${type}`);
  }
  return new BracketEngine(config);
}

export function createCustomBracketEngine(config: BracketConfig): BracketEngine {
  return new BracketEngine(config);
}
