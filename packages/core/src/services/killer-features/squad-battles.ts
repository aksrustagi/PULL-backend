/**
 * KILLER FEATURE #6: Squad Battles
 *
 * Team-based betting competitions where squads compete against each other.
 * Build your squad, choose a captain, and battle for glory.
 *
 * WHY IT KILLS:
 * - Social pressure drives engagement
 * - Team identity creates loyalty
 * - Competitive ranking system
 * - Groups recruit more users
 *
 * K-FACTOR BOOST:
 * - Must invite friends to fill squad
 * - Squad chat and trash talk
 * - Shareable squad achievements
 * - Referral bonuses for squad growth
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const SquadTierSchema = z.enum([
  "bronze",    // New squads
  "silver",    // 5+ battles, 40%+ win rate
  "gold",      // 15+ battles, 50%+ win rate
  "platinum",  // 30+ battles, 55%+ win rate
  "diamond",   // 50+ battles, 60%+ win rate
  "champion",  // Top 100 squads
  "legend",    // Top 10 squads
]);

export type SquadTier = z.infer<typeof SquadTierSchema>;

export const SquadRoleSchema = z.enum([
  "owner",      // Created the squad
  "captain",    // Can start battles, invite members
  "veteran",    // Long-standing member
  "member",     // Regular member
  "recruit",    // New member, limited permissions
]);

export type SquadRole = z.infer<typeof SquadRoleSchema>;

export interface Squad {
  id: string;
  name: string;
  tag: string; // 2-6 char tag like [WOLF]
  description?: string;
  logoUrl?: string;
  bannerUrl?: string;
  tier: SquadTier;

  // Members
  ownerId: string;
  captainIds: string[];
  members: SquadMember[];
  maxMembers: number;

  // Stats
  stats: SquadStats;

  // Progression
  xp: number;
  level: number;

  // Settings
  isPublic: boolean;
  requiresApproval: boolean;
  minLevel?: number;

  // Achievements
  badges: SquadBadge[];

  createdAt: number;
  updatedAt: number;
}

export interface SquadMember {
  userId: string;
  username: string;
  avatarUrl?: string;
  role: SquadRole;

  // Individual stats within squad
  battlesPlayed: number;
  battlesWon: number;
  points: number;
  mvpCount: number;

  // Activity
  lastActiveAt: number;
  joinedAt: number;
}

export interface SquadStats {
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
  bestWinStreak: number;
  totalPoints: number;

  // Leaderboard position
  globalRank?: number;
  tierRank?: number;

  // Weekly/monthly tracking
  weeklyWins: number;
  monthlyWins: number;
}

export interface SquadBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  earnedAt: number;
}

export interface SquadBattle {
  id: string;
  type: "ranked" | "friendly" | "tournament";
  format: BattleFormat;

  // Teams
  squad1: BattleTeam;
  squad2: BattleTeam;

  // Settings
  sport?: string;
  minBets: number;
  maxBets?: number;
  betAmountRule: "any" | "fixed" | "range";
  fixedAmount?: number;
  minAmount?: number;
  maxAmount?: number;

  // Timing
  startsAt: number;
  endsAt: number;
  status: "pending" | "active" | "scoring" | "complete" | "cancelled";

  // Results
  winner?: "squad1" | "squad2" | "draw";
  mvpUserId?: string;

  createdAt: number;
}

export interface BattleFormat {
  name: string;
  description: string;
  scoringType: "wins" | "units" | "roi" | "streak";
  duration: "day" | "week" | "event" | "custom";
  customHours?: number;
}

export interface BattleTeam {
  squadId: string;
  squadName: string;
  squadTag: string;
  participants: BattleParticipant[];
  score: number;
  totalBets: number;
  wins: number;
  losses: number;
  units: number;
}

export interface BattleParticipant {
  userId: string;
  username: string;
  bets: BattleBet[];
  score: number;
  isMVP: boolean;
}

export interface BattleBet {
  betId: string;
  amount: number;
  odds: number;
  result: "pending" | "win" | "loss" | "push";
  units?: number;
  submittedAt: number;
}

export interface SquadInvite {
  id: string;
  squadId: string;
  squadName: string;
  inviterId: string;
  inviterName: string;
  inviteeId?: string;
  inviteCode?: string;
  status: "pending" | "accepted" | "declined" | "expired";
  expiresAt: number;
  createdAt: number;
}

export interface SquadChat {
  id: string;
  squadId: string;
  messages: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  content: string;
  type: "text" | "bet_share" | "battle_update" | "system";
  metadata?: Record<string, any>;
  createdAt: number;
}

// ============================================================================
// SQUAD BATTLES SERVICE
// ============================================================================

export class SquadBattlesService {
  /**
   * Create a new squad
   */
  createSquad(
    ownerId: string,
    ownerUsername: string,
    name: string,
    tag: string,
    options: {
      description?: string;
      isPublic?: boolean;
      requiresApproval?: boolean;
    } = {}
  ): Squad | { error: string } {
    // Validate tag
    if (tag.length < 2 || tag.length > 6) {
      return { error: "Tag must be 2-6 characters" };
    }
    if (!/^[A-Z0-9]+$/.test(tag)) {
      return { error: "Tag must be uppercase letters and numbers only" };
    }

    return {
      id: `squad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      tag,
      description: options.description,
      tier: "bronze",
      ownerId,
      captainIds: [ownerId],
      members: [{
        userId: ownerId,
        username: ownerUsername,
        role: "owner",
        battlesPlayed: 0,
        battlesWon: 0,
        points: 0,
        mvpCount: 0,
        lastActiveAt: Date.now(),
        joinedAt: Date.now(),
      }],
      maxMembers: 10,
      stats: {
        totalBattles: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winStreak: 0,
        bestWinStreak: 0,
        totalPoints: 0,
        weeklyWins: 0,
        monthlyWins: 0,
      },
      xp: 0,
      level: 1,
      isPublic: options.isPublic ?? true,
      requiresApproval: options.requiresApproval ?? false,
      badges: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Calculate squad tier based on stats
   */
  calculateTier(stats: SquadStats): SquadTier {
    const winRate = stats.totalBattles > 0 ? stats.wins / stats.totalBattles : 0;

    if (stats.globalRank && stats.globalRank <= 10) return "legend";
    if (stats.globalRank && stats.globalRank <= 100) return "champion";
    if (stats.totalBattles >= 50 && winRate >= 0.60) return "diamond";
    if (stats.totalBattles >= 30 && winRate >= 0.55) return "platinum";
    if (stats.totalBattles >= 15 && winRate >= 0.50) return "gold";
    if (stats.totalBattles >= 5 && winRate >= 0.40) return "silver";
    return "bronze";
  }

  /**
   * Calculate XP for a battle result
   */
  calculateBattleXP(
    result: "win" | "loss" | "draw",
    opponentTier: SquadTier,
    squadTier: SquadTier,
    battleType: "ranked" | "friendly" | "tournament"
  ): number {
    const tierValues: Record<SquadTier, number> = {
      bronze: 1,
      silver: 2,
      gold: 3,
      platinum: 4,
      diamond: 5,
      champion: 6,
      legend: 7,
    };

    const baseXP = result === "win" ? 100 : result === "draw" ? 30 : 10;
    const tierDiff = tierValues[opponentTier] - tierValues[squadTier];
    const tierBonus = Math.max(0, tierDiff * 20);
    const typeMultiplier = battleType === "tournament" ? 2 : battleType === "ranked" ? 1.5 : 1;

    return Math.round((baseXP + tierBonus) * typeMultiplier);
  }

  /**
   * Create a battle challenge
   */
  createBattle(
    challengerSquad: Squad,
    challengedSquad: Squad,
    options: {
      type: "ranked" | "friendly" | "tournament";
      format: BattleFormat;
      sport?: string;
      startsAt?: number;
      duration?: number;
    }
  ): SquadBattle {
    const startsAt = options.startsAt ?? Date.now();
    const durationMs = this.getDurationMs(options.format.duration, options.format.customHours);

    return {
      id: `battle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: options.type,
      format: options.format,
      squad1: {
        squadId: challengerSquad.id,
        squadName: challengerSquad.name,
        squadTag: challengerSquad.tag,
        participants: [],
        score: 0,
        totalBets: 0,
        wins: 0,
        losses: 0,
        units: 0,
      },
      squad2: {
        squadId: challengedSquad.id,
        squadName: challengedSquad.name,
        squadTag: challengedSquad.tag,
        participants: [],
        score: 0,
        totalBets: 0,
        wins: 0,
        losses: 0,
        units: 0,
      },
      sport: options.sport,
      minBets: 3,
      betAmountRule: "any",
      startsAt,
      endsAt: startsAt + durationMs,
      status: "pending",
      createdAt: Date.now(),
    };
  }

  /**
   * Calculate battle score
   */
  calculateBattleScore(
    team: BattleTeam,
    scoringType: BattleFormat["scoringType"]
  ): number {
    switch (scoringType) {
      case "wins":
        return team.wins;
      case "units":
        return team.units;
      case "roi":
        const totalWagered = team.participants.reduce(
          (sum, p) => sum + p.bets.reduce((s, b) => s + b.amount, 0),
          0
        );
        return totalWagered > 0 ? (team.units / totalWagered) * 100 : 0;
      case "streak":
        return this.calculateBestStreak(team);
      default:
        return team.wins;
    }
  }

  /**
   * Determine battle MVP
   */
  determineMVP(battle: SquadBattle): string | null {
    const allParticipants = [
      ...battle.squad1.participants,
      ...battle.squad2.participants,
    ];

    if (allParticipants.length === 0) return null;

    // Score participants by performance
    const scored = allParticipants.map(p => ({
      userId: p.userId,
      score: this.calculateParticipantMVPScore(p),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.userId ?? null;
  }

  /**
   * Generate invite code
   */
  generateInvite(
    squad: Squad,
    inviterId: string,
    inviterName: string,
    inviteeId?: string
  ): SquadInvite {
    return {
      id: `invite_${Date.now()}`,
      squadId: squad.id,
      squadName: squad.name,
      inviterId,
      inviterName,
      inviteeId,
      inviteCode: inviteeId ? undefined : Math.random().toString(36).substring(2, 10).toUpperCase(),
      status: "pending",
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
      createdAt: Date.now(),
    };
  }

  /**
   * Get battle formats
   */
  getBattleFormats(): BattleFormat[] {
    return [
      {
        name: "Daily Showdown",
        description: "24-hour battle, most wins takes it",
        scoringType: "wins",
        duration: "day",
      },
      {
        name: "Unit Battle",
        description: "Who can win the most units?",
        scoringType: "units",
        duration: "day",
      },
      {
        name: "Weekly War",
        description: "Week-long battle for supremacy",
        scoringType: "wins",
        duration: "week",
      },
      {
        name: "ROI Royale",
        description: "Highest ROI wins, efficiency matters",
        scoringType: "roi",
        duration: "week",
      },
      {
        name: "Event Clash",
        description: "Single event showdown",
        scoringType: "wins",
        duration: "event",
      },
      {
        name: "Streak Mode",
        description: "Best winning streak wins",
        scoringType: "streak",
        duration: "day",
      },
    ];
  }

  /**
   * Get squad leaderboard
   */
  getLeaderboard(
    squads: Squad[],
    options: {
      tier?: SquadTier;
      sortBy: "wins" | "points" | "winStreak" | "level";
      limit?: number;
    }
  ): Array<Squad & { rank: number }> {
    let filtered = squads;

    if (options.tier) {
      filtered = filtered.filter(s => s.tier === options.tier);
    }

    const sortFn = (a: Squad, b: Squad) => {
      switch (options.sortBy) {
        case "wins": return b.stats.wins - a.stats.wins;
        case "points": return b.stats.totalPoints - a.stats.totalPoints;
        case "winStreak": return b.stats.bestWinStreak - a.stats.bestWinStreak;
        case "level": return b.level - a.level;
        default: return b.stats.wins - a.stats.wins;
      }
    };

    return filtered
      .sort(sortFn)
      .slice(0, options.limit ?? 100)
      .map((squad, idx) => ({ ...squad, rank: idx + 1 }));
  }

  private getDurationMs(duration: BattleFormat["duration"], customHours?: number): number {
    switch (duration) {
      case "day": return 24 * 60 * 60 * 1000;
      case "week": return 7 * 24 * 60 * 60 * 1000;
      case "event": return 4 * 60 * 60 * 1000; // 4 hours default for events
      case "custom": return (customHours ?? 24) * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000;
    }
  }

  private calculateBestStreak(team: BattleTeam): number {
    let bestStreak = 0;
    let currentStreak = 0;

    // Flatten all bets sorted by time
    const allBets = team.participants
      .flatMap(p => p.bets)
      .sort((a, b) => a.submittedAt - b.submittedAt);

    for (const bet of allBets) {
      if (bet.result === "win") {
        currentStreak++;
        bestStreak = Math.max(bestStreak, currentStreak);
      } else if (bet.result === "loss") {
        currentStreak = 0;
      }
    }

    return bestStreak;
  }

  private calculateParticipantMVPScore(p: BattleParticipant): number {
    const wins = p.bets.filter(b => b.result === "win").length;
    const losses = p.bets.filter(b => b.result === "loss").length;
    const units = p.bets.reduce((sum, b) => sum + (b.units ?? 0), 0);

    return (wins * 10) - (losses * 5) + (units * 2);
  }
}

// ============================================================================
// SQUAD BADGES
// ============================================================================

export const SQUAD_BADGES: SquadBadge[] = [
  {
    id: "first_battle",
    name: "Battle Tested",
    description: "Completed your first squad battle",
    icon: "⚔️",
    rarity: "common",
    earnedAt: 0,
  },
  {
    id: "win_streak_5",
    name: "On Fire",
    description: "Won 5 battles in a row",
    icon: "🔥",
    rarity: "rare",
    earnedAt: 0,
  },
  {
    id: "win_streak_10",
    name: "Unstoppable",
    description: "Won 10 battles in a row",
    icon: "💪",
    rarity: "epic",
    earnedAt: 0,
  },
  {
    id: "full_squad",
    name: "Full House",
    description: "Reached maximum squad members",
    icon: "👥",
    rarity: "common",
    earnedAt: 0,
  },
  {
    id: "tournament_win",
    name: "Tournament Champions",
    description: "Won a tournament battle",
    icon: "🏆",
    rarity: "epic",
    earnedAt: 0,
  },
  {
    id: "top_100",
    name: "Elite Squad",
    description: "Reached top 100 global ranking",
    icon: "💎",
    rarity: "legendary",
    earnedAt: 0,
  },
];

// ============================================================================
// FACTORY
// ============================================================================

export function createSquadBattlesService(): SquadBattlesService {
  return new SquadBattlesService();
}
