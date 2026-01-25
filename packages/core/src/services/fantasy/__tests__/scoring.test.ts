/**
 * Fantasy Scoring Engine Tests
 */

import { describe, it, expect } from "vitest";
import {
  calculatePlayerScore,
  calculateTeamScore,
  optimizeLineup,
  DEFAULT_PPR_RULES,
  DEFAULT_HALF_PPR_RULES,
  DEFAULT_STANDARD_RULES,
} from "../scoring";
import type { PlayerStats, Roster } from "../types";

describe("Fantasy Scoring Engine", () => {
  describe("calculatePlayerScore", () => {
    it("should calculate PPR scoring correctly for a QB", () => {
      const stats: Partial<PlayerStats> = {
        passingYards: 300,
        passingTouchdowns: 3,
        interceptions: 1,
        rushingYards: 25,
        rushingTouchdowns: 0,
        fumbles: 0,
      };

      const score = calculatePlayerScore(stats, DEFAULT_PPR_RULES);

      // 300 yards / 25 = 12 pts
      // 3 TDs * 4 = 12 pts
      // 1 INT * -2 = -2 pts
      // 25 rush yards / 10 = 2.5 pts
      // Total = 24.5
      expect(score).toBeCloseTo(24.5, 1);
    });

    it("should calculate PPR scoring for a RB with receptions", () => {
      const stats: Partial<PlayerStats> = {
        rushingYards: 100,
        rushingTouchdowns: 1,
        receptions: 5,
        receivingYards: 40,
        receivingTouchdowns: 0,
        fumbles: 0,
      };

      const score = calculatePlayerScore(stats, DEFAULT_PPR_RULES);

      // 100 rush yards / 10 = 10 pts
      // 1 rush TD * 6 = 6 pts
      // 5 receptions * 1 = 5 pts (PPR)
      // 40 rec yards / 10 = 4 pts
      // Total = 25
      expect(score).toBe(25);
    });

    it("should calculate Half-PPR scoring correctly", () => {
      const stats: Partial<PlayerStats> = {
        receptions: 6,
        receivingYards: 80,
        receivingTouchdowns: 1,
      };

      const score = calculatePlayerScore(stats, DEFAULT_HALF_PPR_RULES);

      // 6 receptions * 0.5 = 3 pts
      // 80 rec yards / 10 = 8 pts
      // 1 TD * 6 = 6 pts
      // Total = 17
      expect(score).toBe(17);
    });

    it("should calculate Standard (non-PPR) scoring correctly", () => {
      const stats: Partial<PlayerStats> = {
        receptions: 6,
        receivingYards: 80,
        receivingTouchdowns: 1,
      };

      const score = calculatePlayerScore(stats, DEFAULT_STANDARD_RULES);

      // 6 receptions * 0 = 0 pts (Standard)
      // 80 rec yards / 10 = 8 pts
      // 1 TD * 6 = 6 pts
      // Total = 14
      expect(score).toBe(14);
    });

    it("should apply negative points for turnovers", () => {
      const stats: Partial<PlayerStats> = {
        passingYards: 200,
        interceptions: 2,
        fumbles: 1,
      };

      const score = calculatePlayerScore(stats, DEFAULT_PPR_RULES);

      // 200 yards / 25 = 8 pts
      // 2 INTs * -2 = -4 pts
      // 1 fumble * -2 = -2 pts
      // Total = 2
      expect(score).toBe(2);
    });

    it("should handle bonus yards correctly", () => {
      const rulesWithBonus = {
        ...DEFAULT_PPR_RULES,
        passingYards300Bonus: 3,
        rushingYards100Bonus: 2,
        receivingYards100Bonus: 2,
      };

      const stats: Partial<PlayerStats> = {
        passingYards: 350,
        rushingYards: 120,
        receivingYards: 110,
      };

      const baseScore = calculatePlayerScore(stats, DEFAULT_PPR_RULES);
      const bonusScore = calculatePlayerScore(stats, rulesWithBonus);

      // Should have 3 + 2 + 2 = 7 extra bonus points
      expect(bonusScore).toBe(baseScore + 7);
    });

    it("should handle kicker scoring", () => {
      const stats: Partial<PlayerStats> = {
        fieldGoalsMade: 3,
        fieldGoalsAttempted: 4,
        extraPointsMade: 2,
        extraPointsAttempted: 2,
      };

      const score = calculatePlayerScore(stats, DEFAULT_PPR_RULES);

      // 3 FGs * 3 = 9 pts (assuming average distance)
      // 1 missed FG * -1 = -1 pt
      // 2 XPs * 1 = 2 pts
      // Total = 10
      expect(score).toBeGreaterThan(0);
    });

    it("should return 0 for empty stats", () => {
      const stats: Partial<PlayerStats> = {};
      const score = calculatePlayerScore(stats, DEFAULT_PPR_RULES);
      expect(score).toBe(0);
    });
  });

  describe("calculateTeamScore", () => {
    it("should sum all starting players scores", () => {
      const roster: Roster = {
        id: "roster-1",
        teamId: "team-1",
        leagueId: "league-1",
        week: 1,
        players: [
          { id: "p1", name: "QB1", position: "QB", rosterSlot: "QB", points: 20, team: "KC" },
          { id: "p2", name: "RB1", position: "RB", rosterSlot: "RB", points: 15, team: "SF" },
          { id: "p3", name: "RB2", position: "RB", rosterSlot: "RB", points: 12, team: "DAL" },
          { id: "p4", name: "WR1", position: "WR", rosterSlot: "WR", points: 18, team: "MIA" },
          { id: "p5", name: "WR2", position: "WR", rosterSlot: "WR", points: 10, team: "PHI" },
          { id: "p6", name: "TE1", position: "TE", rosterSlot: "TE", points: 8, team: "KC" },
          { id: "p7", name: "FLEX", position: "WR", rosterSlot: "FLEX", points: 14, team: "BUF" },
          { id: "p8", name: "K1", position: "K", rosterSlot: "K", points: 9, team: "SF" },
          { id: "p9", name: "DEF1", position: "DEF", rosterSlot: "DEF", points: 7, team: "SF" },
          { id: "p10", name: "BN1", position: "WR", rosterSlot: "BN", points: 5, team: "NYJ" },
        ],
        projectedScore: 120,
        currentScore: 113,
      };

      const score = calculateTeamScore(roster, "ppr");

      // Sum of starting players (not bench): 20+15+12+18+10+8+14+9+7 = 113
      expect(score).toBe(113);
    });

    it("should exclude bench and IR players", () => {
      const roster: Roster = {
        id: "roster-1",
        teamId: "team-1",
        leagueId: "league-1",
        week: 1,
        players: [
          { id: "p1", name: "QB1", position: "QB", rosterSlot: "QB", points: 20, team: "KC" },
          { id: "p2", name: "BN1", position: "RB", rosterSlot: "BN", points: 25, team: "SF" },
          { id: "p3", name: "IR1", position: "RB", rosterSlot: "IR", points: 30, team: "DAL" },
        ],
        projectedScore: 20,
        currentScore: 20,
      };

      const score = calculateTeamScore(roster, "ppr");

      // Only QB should count
      expect(score).toBe(20);
    });
  });

  describe("optimizeLineup", () => {
    it("should identify suboptimal lineup decisions", () => {
      const roster: Roster = {
        id: "roster-1",
        teamId: "team-1",
        leagueId: "league-1",
        week: 1,
        players: [
          { id: "p1", name: "RB-Starter", position: "RB", rosterSlot: "RB", projectedPoints: 10, team: "KC" },
          { id: "p2", name: "RB-Bench", position: "RB", rosterSlot: "BN", projectedPoints: 20, team: "SF" },
        ],
        projectedScore: 10,
        currentScore: 0,
      };

      const result = optimizeLineup(roster);

      expect(result.optimized).toBeGreaterThan(result.current);
      expect(result.moves.length).toBeGreaterThan(0);
      expect(result.moves[0]).toMatchObject({
        type: "swap",
        from: expect.any(String),
        to: expect.any(String),
      });
    });

    it("should not suggest changes for optimal lineup", () => {
      const roster: Roster = {
        id: "roster-1",
        teamId: "team-1",
        leagueId: "league-1",
        week: 1,
        players: [
          { id: "p1", name: "RB-Starter", position: "RB", rosterSlot: "RB", projectedPoints: 20, team: "KC" },
          { id: "p2", name: "RB-Bench", position: "RB", rosterSlot: "BN", projectedPoints: 10, team: "SF" },
        ],
        projectedScore: 20,
        currentScore: 0,
      };

      const result = optimizeLineup(roster);

      expect(result.moves.length).toBe(0);
      expect(result.current).toBe(result.optimized);
    });
  });
});
