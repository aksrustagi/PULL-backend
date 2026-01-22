/**
 * Fantasy Football Scoring Engine
 *
 * Calculates fantasy points based on player stats and scoring rules.
 * Supports PPR, Half-PPR, and Standard scoring formats.
 */

import {
  type PlayerStats,
  type ScoringRules,
  type ScoringType,
  type RosterEntry,
  type Roster,
  EMPTY_STATS,
  getScoringRules,
  STARTER_SLOTS,
} from "./types";

/**
 * Calculate fantasy points for a player based on their stats and scoring rules
 */
export function calculatePlayerScore(
  stats: Partial<PlayerStats>,
  rules: ScoringRules
): number {
  const s = { ...EMPTY_STATS, ...stats };
  let points = 0;

  // Passing
  points += s.passingYards * rules.passingYardsPerPoint;
  points += s.passingTouchdowns * rules.passingTd;
  points += s.interceptions * rules.interception;

  // Rushing
  points += s.rushingYards * rules.rushingYardsPerPoint;
  points += s.rushingTouchdowns * rules.rushingTd;

  // Receiving
  points += s.receivingYards * rules.receivingYardsPerPoint;
  points += s.receivingTouchdowns * rules.receivingTd;
  points += s.receptions * rules.reception;

  // Misc offense
  points += s.fumblesLost * rules.fumble;
  points += s.twoPointConversions * rules.twoPointConversion;

  // Kicking
  points += s.fg0_39 * rules.fgMade;
  points += s.fg40_49 * rules.fg40_49;
  points += s.fg50Plus * rules.fg50Plus;
  points += s.xpMade * rules.extraPoint;

  // Missed FG penalty (fgAttempts - fgMade = missed)
  const missedFg = s.fgAttempts - s.fgMade;
  points += missedFg * rules.fgMissed;

  // Defense/Special Teams
  points += s.defSacks * rules.sack;
  points += s.defInterceptions * rules.defenseInterception;
  points += s.defFumbleRecoveries * rules.fumbleRecovery;
  points += s.defTouchdowns * rules.defenseTd;
  points += s.defSafeties * rules.safety;
  points += s.defBlockedKicks * rules.blockedKick;

  // Defense points allowed
  if (s.defPointsAllowed === 0) {
    points += rules.pointsAllowed0;
  } else if (s.defPointsAllowed <= 6) {
    points += rules.pointsAllowed1_6;
  } else if (s.defPointsAllowed <= 13) {
    points += rules.pointsAllowed7_13;
  } else if (s.defPointsAllowed <= 20) {
    points += rules.pointsAllowed14_20;
  } else if (s.defPointsAllowed <= 27) {
    points += rules.pointsAllowed21_27;
  } else if (s.defPointsAllowed <= 34) {
    points += rules.pointsAllowed28_34;
  } else {
    points += rules.pointsAllowed35Plus;
  }

  return Math.round(points * 100) / 100;
}

/**
 * Calculate fantasy points for different scoring types
 */
export function calculatePlayerScoreAllFormats(stats: Partial<PlayerStats>): {
  standard: number;
  halfPpr: number;
  ppr: number;
} {
  return {
    standard: calculatePlayerScore(stats, getScoringRules("standard")),
    halfPpr: calculatePlayerScore(stats, getScoringRules("half_ppr")),
    ppr: calculatePlayerScore(stats, getScoringRules("ppr")),
  };
}

/**
 * Calculate total team score from roster
 */
export function calculateTeamScore(
  roster: Roster,
  scoringType: ScoringType
): number {
  const rules = getScoringRules(scoringType);
  let total = 0;

  for (const entry of roster.entries) {
    if (entry.isStarter && !entry.isLocked && entry.actualPoints !== undefined) {
      total += entry.actualPoints;
    }
  }

  return Math.round(total * 100) / 100;
}

/**
 * Calculate projected team score from roster
 */
export function calculateProjectedTeamScore(roster: Roster): number {
  let total = 0;

  for (const entry of roster.entries) {
    if (entry.isStarter) {
      total += entry.projectedPoints;
    }
  }

  return Math.round(total * 100) / 100;
}

/**
 * Calculate roster entries with points
 */
export function calculateRosterPoints(
  entries: RosterEntry[],
  weekStats: Map<string, Partial<PlayerStats>>,
  rules: ScoringRules
): RosterEntry[] {
  return entries.map((entry) => {
    const stats = weekStats.get(entry.playerId);
    const actualPoints = stats ? calculatePlayerScore(stats, rules) : undefined;

    return {
      ...entry,
      actualPoints,
    };
  });
}

/**
 * Optimize lineup by moving highest-scoring bench players to starter slots
 * Returns recommended lineup changes
 */
export function optimizeLineup(roster: Roster): {
  current: number;
  optimized: number;
  moves: Array<{
    playerName: string;
    from: string;
    to: string;
    pointsGained: number;
  }>;
} {
  const moves: Array<{
    playerName: string;
    from: string;
    to: string;
    pointsGained: number;
  }> = [];

  const starters = roster.entries.filter((e) => e.isStarter && !e.isLocked);
  const bench = roster.entries.filter((e) => !e.isStarter && !e.isLocked);

  const current = calculateProjectedTeamScore(roster);

  // Group starters by slot type
  const slotMap = new Map<string, RosterEntry[]>();
  for (const starter of starters) {
    const slotType = starter.slot.replace(/[0-9]/g, "");
    if (!slotMap.has(slotType)) {
      slotMap.set(slotType, []);
    }
    slotMap.get(slotType)!.push(starter);
  }

  // Check each bench player
  for (const benchPlayer of bench) {
    const position = benchPlayer.player.position;
    const eligibleSlots = getEligibleSlots(position);

    for (const slotType of eligibleSlots) {
      const currentStarters = slotMap.get(slotType) || [];

      for (const starter of currentStarters) {
        if (benchPlayer.projectedPoints > starter.projectedPoints) {
          const pointsGained =
            benchPlayer.projectedPoints - starter.projectedPoints;
          if (pointsGained > 0.5) {
            moves.push({
              playerName: benchPlayer.player.name,
              from: benchPlayer.slot,
              to: starter.slot,
              pointsGained,
            });
          }
        }
      }
    }
  }

  // Sort by points gained
  moves.sort((a, b) => b.pointsGained - a.pointsGained);

  const optimized = current + moves.reduce((sum, m) => sum + m.pointsGained, 0);

  return {
    current,
    optimized,
    moves: moves.slice(0, 5), // Top 5 suggestions
  };
}

/**
 * Get eligible starter slots for a position
 */
function getEligibleSlots(position: string): string[] {
  switch (position) {
    case "QB":
      return ["QB"];
    case "RB":
      return ["RB", "FLEX"];
    case "WR":
      return ["WR", "FLEX"];
    case "TE":
      return ["TE", "FLEX"];
    case "K":
      return ["K"];
    case "DEF":
      return ["DEF"];
    default:
      return [];
  }
}

/**
 * Check if a lineup is valid
 */
export function validateLineup(roster: Roster): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  const starters = roster.entries.filter((e) => STARTER_SLOTS.includes(e.slot));

  // Check for empty starter slots
  for (const slot of STARTER_SLOTS) {
    const player = starters.find((e) => e.slot === slot);
    if (!player) {
      errors.push(`Empty slot: ${slot}`);
    }
  }

  // Check for position eligibility
  for (const entry of starters) {
    const eligible = getEligibleSlots(entry.player.position);
    const slotType = entry.slot.replace(/[0-9]/g, "");
    if (!eligible.includes(slotType)) {
      errors.push(
        `${entry.player.name} (${entry.player.position}) not eligible for ${entry.slot}`
      );
    }
  }

  // Check for injured players in lineup
  for (const entry of starters) {
    if (entry.player.status === "out" || entry.player.status === "injured_reserve") {
      warnings.push(`${entry.player.name} is OUT but in starting lineup`);
    } else if (entry.player.status === "doubtful") {
      warnings.push(`${entry.player.name} is DOUBTFUL`);
    }
  }

  // Check for bye week players
  // This would need the current week to be passed in

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Calculate win probability between two teams based on projections
 */
export function calculateWinProbability(
  teamAProjected: number,
  teamBProjected: number,
  standardDeviation: number = 20
): { teamA: number; teamB: number; tie: number } {
  // Using normal distribution approximation
  const diff = teamAProjected - teamBProjected;
  const combinedStdDev = Math.sqrt(2) * standardDeviation;

  // Z-score
  const z = diff / combinedStdDev;

  // Approximate normal CDF
  const teamAWinProb = normalCDF(z);
  const tieProb = 0.005; // ~0.5% tie probability
  const teamBWinProb = 1 - teamAWinProb - tieProb;

  return {
    teamA: Math.round(teamAWinProb * 1000) / 1000,
    teamB: Math.round(Math.max(0, teamBWinProb) * 1000) / 1000,
    tie: tieProb,
  };
}

/**
 * Approximate normal CDF
 */
function normalCDF(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * z);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Calculate season standings
 */
export function calculateStandings(
  teams: Array<{
    id: string;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    pointsAgainst: number;
  }>
): Array<{
  teamId: string;
  rank: number;
  winPercentage: number;
  gamesBack: number;
}> {
  // Sort by wins (desc), then by points for (desc)
  const sorted = [...teams].sort((a, b) => {
    const aWinPct = (a.wins + a.ties * 0.5) / (a.wins + a.losses + a.ties || 1);
    const bWinPct = (b.wins + b.ties * 0.5) / (b.wins + b.losses + b.ties || 1);

    if (bWinPct !== aWinPct) return bWinPct - aWinPct;
    return b.pointsFor - a.pointsFor;
  });

  const leader = sorted[0];
  const leaderWins = leader.wins + leader.ties * 0.5;

  return sorted.map((team, index) => {
    const totalGames = team.wins + team.losses + team.ties || 1;
    const winPercentage = (team.wins + team.ties * 0.5) / totalGames;
    const teamWins = team.wins + team.ties * 0.5;
    const gamesBack = (leaderWins - teamWins) / 1;

    return {
      teamId: team.id,
      rank: index + 1,
      winPercentage: Math.round(winPercentage * 1000) / 1000,
      gamesBack: Math.round(gamesBack * 10) / 10,
    };
  });
}

/**
 * Determine playoff seeding
 */
export function determinePlayoffSeeds(
  standings: Array<{
    teamId: string;
    rank: number;
  }>,
  playoffTeams: number
): Array<{
  teamId: string;
  seed: number;
  isPlayoffBound: boolean;
}> {
  return standings.map((team, index) => ({
    teamId: team.teamId,
    seed: index + 1,
    isPlayoffBound: index < playoffTeams,
  }));
}
