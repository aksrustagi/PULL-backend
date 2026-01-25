/**
 * Daily Challenges Service
 *
 * Manages challenge definitions, user progress, and rewards.
 */

import {
  type ChallengeDefinition,
  type UserChallenge,
  type ChallengeProgress,
  type ChallengeProgressEvent,
  type ChallengeCompletionEvent,
  type ChallengeType,
  type ChallengeCategory,
  type ChallengeStatus,
  type RequirementType,
  type StartChallengeInput,
  type ClaimRewardsInput,
  DAILY_CHALLENGE_TEMPLATES,
  WEEKLY_CHALLENGE_TEMPLATES,
} from "./types";
import { ChallengeRewardsProcessor } from "./rewards";

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class ChallengeService {
  private definitions: Map<string, ChallengeDefinition> = new Map();
  private userChallenges: Map<string, Map<string, UserChallenge>> = new Map();
  private rewardsProcessor: ChallengeRewardsProcessor;

  constructor() {
    this.rewardsProcessor = new ChallengeRewardsProcessor();
    this.initializeDefinitions();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializeDefinitions(): void {
    const now = Date.now();

    // Add daily challenges
    DAILY_CHALLENGE_TEMPLATES.forEach((template, index) => {
      const id = `daily_${index + 1}`;
      this.definitions.set(id, {
        ...template,
        id,
        createdAt: now,
        updatedAt: now,
      });
    });

    // Add weekly challenges
    WEEKLY_CHALLENGE_TEMPLATES.forEach((template, index) => {
      const id = `weekly_${index + 1}`;
      this.definitions.set(id, {
        ...template,
        id,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  // ============================================================================
  // CHALLENGE MANAGEMENT
  // ============================================================================

  /**
   * Get available challenges for a user
   */
  async getAvailableChallenges(
    userId: string,
    type?: ChallengeType,
    category?: ChallengeCategory
  ): Promise<{ definition: ChallengeDefinition; userChallenge?: UserChallenge }[]> {
    const now = Date.now();
    let definitions = Array.from(this.definitions.values());

    // Filter by type
    if (type) {
      definitions = definitions.filter((d) => d.type === type);
    }

    // Filter by category
    if (category) {
      definitions = definitions.filter((d) => d.category === category);
    }

    // Filter active challenges
    definitions = definitions.filter((d) => {
      if (!d.isActive) return false;
      if (d.startsAt && now < d.startsAt) return false;
      if (d.endsAt && now > d.endsAt) return false;
      return true;
    });

    // Get user's challenge states
    const userMap = this.userChallenges.get(userId);

    return definitions.map((definition) => ({
      definition,
      userChallenge: userMap?.get(definition.id),
    }));
  }

  /**
   * Get today's daily challenges
   */
  async getDailyChallenges(userId: string): Promise<{ definition: ChallengeDefinition; userChallenge?: UserChallenge }[]> {
    return this.getAvailableChallenges(userId, "daily");
  }

  /**
   * Get weekly challenges
   */
  async getWeeklyChallenges(userId: string): Promise<{ definition: ChallengeDefinition; userChallenge?: UserChallenge }[]> {
    return this.getAvailableChallenges(userId, "weekly");
  }

  /**
   * Get user's active challenges
   */
  async getActiveChallenges(userId: string): Promise<UserChallenge[]> {
    const userMap = this.userChallenges.get(userId);
    if (!userMap) return [];

    return Array.from(userMap.values()).filter(
      (c) => c.status === "active" && c.expiresAt > Date.now()
    );
  }

  /**
   * Get user's completed challenges
   */
  async getCompletedChallenges(userId: string, limit: number = 50): Promise<UserChallenge[]> {
    const userMap = this.userChallenges.get(userId);
    if (!userMap) return [];

    return Array.from(userMap.values())
      .filter((c) => c.status === "completed" || c.status === "claimed")
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      .slice(0, limit);
  }

  // ============================================================================
  // CHALLENGE LIFECYCLE
  // ============================================================================

  /**
   * Start a challenge
   */
  async startChallenge(
    userId: string,
    input: StartChallengeInput
  ): Promise<UserChallenge> {
    const definition = this.definitions.get(input.challengeId);
    if (!definition) {
      throw new Error("Challenge not found");
    }

    // Check if already active
    let userMap = this.userChallenges.get(userId);
    if (!userMap) {
      userMap = new Map();
      this.userChallenges.set(userId, userMap);
    }

    const existing = userMap.get(input.challengeId);
    if (existing && existing.status === "active" && existing.expiresAt > Date.now()) {
      throw new Error("Challenge already active");
    }

    // Check prerequisites
    if (definition.prerequisites) {
      for (const prereqId of definition.prerequisites) {
        const prereq = userMap.get(prereqId);
        if (!prereq || prereq.status !== "claimed") {
          throw new Error(`Prerequisite challenge ${prereqId} not completed`);
        }
      }
    }

    // Initialize progress
    const progress: ChallengeProgress[] = definition.requirements.map((req, index) => ({
      requirementIndex: index,
      current: 0,
      target: req.target,
      isComplete: false,
      lastUpdatedAt: Date.now(),
    }));

    const userChallenge: UserChallenge = {
      id: `uc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      oderId: userId,
      challengeId: input.challengeId,
      status: "active",
      progress,
      overallProgress: 0,
      isComplete: false,
      startedAt: Date.now(),
      expiresAt: Date.now() + (definition.duration * 1000),
      rewardsClaimed: false,
      bonusEarned: false,
      attemptNumber: (existing?.attemptNumber ?? 0) + 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    userMap.set(input.challengeId, userChallenge);
    return userChallenge;
  }

  /**
   * Update challenge progress
   */
  async updateProgress(
    userId: string,
    challengeId: string,
    requirementType: RequirementType,
    value: number,
    source: string
  ): Promise<ChallengeProgressEvent | ChallengeCompletionEvent | null> {
    const userMap = this.userChallenges.get(userId);
    if (!userMap) return null;

    const userChallenge = userMap.get(challengeId);
    if (!userChallenge || userChallenge.status !== "active") return null;

    // Check if expired
    if (userChallenge.expiresAt < Date.now()) {
      userChallenge.status = "expired";
      userMap.set(challengeId, userChallenge);
      return null;
    }

    const definition = this.definitions.get(challengeId);
    if (!definition) return null;

    // Find matching requirement
    let progressMade = false;
    for (let i = 0; i < definition.requirements.length; i++) {
      const req = definition.requirements[i];
      const prog = userChallenge.progress[i];

      if (req.type === requirementType && !prog.isComplete) {
        const previousProgress = prog.current;
        prog.current = Math.min(prog.target, prog.current + value);
        prog.isComplete = prog.current >= prog.target;
        prog.lastUpdatedAt = Date.now();
        progressMade = true;

        // Generate progress event
        if (prog.current !== previousProgress) {
          userChallenge.updatedAt = Date.now();
        }
      }
    }

    if (!progressMade) return null;

    // Calculate overall progress
    const totalProgress = userChallenge.progress.reduce((sum, p) => sum + (p.current / p.target), 0);
    userChallenge.overallProgress = (totalProgress / userChallenge.progress.length) * 100;

    // Check completion
    const allComplete = definition.requirementLogic === "all"
      ? userChallenge.progress.every((p) => p.isComplete)
      : userChallenge.progress.some((p) => p.isComplete);

    if (allComplete && !userChallenge.isComplete) {
      userChallenge.isComplete = true;
      userChallenge.status = "completed";
      userChallenge.completedAt = Date.now();

      // Check bonus (e.g., completed in less than half the time)
      const timeUsed = userChallenge.completedAt - userChallenge.startedAt;
      const allowedTime = definition.duration * 1000;
      if (timeUsed < allowedTime * 0.5) {
        userChallenge.bonusEarned = true;
      }

      userMap.set(challengeId, userChallenge);

      return {
        userId,
        challengeId,
        userChallengeId: userChallenge.id,
        challengeName: definition.name,
        rewards: definition.rewards,
        bonusEarned: userChallenge.bonusEarned,
        completedAt: userChallenge.completedAt,
        timeToComplete: timeUsed / 1000,
      };
    }

    userMap.set(challengeId, userChallenge);

    // Return progress event
    return {
      userId,
      challengeId,
      userChallengeId: userChallenge.id,
      requirementIndex: 0,
      previousProgress: 0,
      newProgress: userChallenge.overallProgress,
      target: 100,
      source,
      timestamp: Date.now(),
    };
  }

  /**
   * Process an action and update all relevant challenges
   */
  async processAction(
    userId: string,
    action: RequirementType,
    value: number,
    metadata?: Record<string, any>
  ): Promise<(ChallengeProgressEvent | ChallengeCompletionEvent)[]> {
    const events: (ChallengeProgressEvent | ChallengeCompletionEvent)[] = [];
    const activeChallenges = await this.getActiveChallenges(userId);

    for (const challenge of activeChallenges) {
      const event = await this.updateProgress(
        userId,
        challenge.challengeId,
        action,
        value,
        action
      );
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  /**
   * Claim challenge rewards
   */
  async claimRewards(
    userId: string,
    input: ClaimRewardsInput
  ): Promise<{ success: boolean; rewards: { type: string; value: any }[] }> {
    const userMap = this.userChallenges.get(userId);
    if (!userMap) {
      throw new Error("Challenge not found");
    }

    // Find challenge by user challenge ID
    let userChallenge: UserChallenge | undefined;
    for (const challenge of userMap.values()) {
      if (challenge.id === input.userChallengeId) {
        userChallenge = challenge;
        break;
      }
    }

    if (!userChallenge) {
      throw new Error("Challenge not found");
    }

    if (userChallenge.oderId !== userId) {
      throw new Error("Unauthorized");
    }

    if (userChallenge.status !== "completed") {
      throw new Error("Challenge not completed");
    }

    if (userChallenge.rewardsClaimed) {
      throw new Error("Rewards already claimed");
    }

    const definition = this.definitions.get(userChallenge.challengeId);
    if (!definition) {
      throw new Error("Challenge definition not found");
    }

    // Process rewards
    let allRewards = [...definition.rewards];
    if (userChallenge.bonusEarned && definition.bonusRewards) {
      allRewards = [...allRewards, ...definition.bonusRewards];
    }

    const processedRewards = await this.rewardsProcessor.processRewards(userId, allRewards);

    // Update status
    userChallenge.rewardsClaimed = true;
    userChallenge.claimedAt = Date.now();
    userChallenge.status = "claimed";
    userMap.set(userChallenge.challengeId, userChallenge);

    return { success: true, rewards: processedRewards };
  }

  // ============================================================================
  // CHALLENGE ROTATION
  // ============================================================================

  /**
   * Rotate daily challenges (call at midnight)
   */
  async rotateDailyChallenges(): Promise<void> {
    // Mark all active daily challenges as expired
    for (const [userId, userMap] of this.userChallenges.entries()) {
      for (const [challengeId, challenge] of userMap.entries()) {
        const definition = this.definitions.get(challengeId);
        if (definition?.type === "daily" && challenge.status === "active") {
          challenge.status = "expired";
          userMap.set(challengeId, challenge);
        }
      }
    }

    // Could also shuffle/rotate which challenges are available
  }

  /**
   * Rotate weekly challenges (call at start of week)
   */
  async rotateWeeklyChallenges(): Promise<void> {
    for (const [userId, userMap] of this.userChallenges.entries()) {
      for (const [challengeId, challenge] of userMap.entries()) {
        const definition = this.definitions.get(challengeId);
        if (definition?.type === "weekly" && challenge.status === "active") {
          challenge.status = "expired";
          userMap.set(challengeId, challenge);
        }
      }
    }
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get user's challenge statistics
   */
  async getChallengeStats(userId: string): Promise<{
    totalCompleted: number;
    totalClaimed: number;
    totalPointsEarned: number;
    currentStreak: number;
    longestStreak: number;
    completionRate: number;
    byCategory: Record<string, { completed: number; attempted: number }>;
    recentCompletions: UserChallenge[];
  }> {
    const userMap = this.userChallenges.get(userId);

    if (!userMap) {
      return {
        totalCompleted: 0,
        totalClaimed: 0,
        totalPointsEarned: 0,
        currentStreak: 0,
        longestStreak: 0,
        completionRate: 0,
        byCategory: {},
        recentCompletions: [],
      };
    }

    const challenges = Array.from(userMap.values());
    const completed = challenges.filter((c) => c.status === "completed" || c.status === "claimed");
    const attempted = challenges.filter((c) => c.status !== "locked" && c.status !== "available");

    const byCategory: Record<string, { completed: number; attempted: number }> = {};
    for (const challenge of challenges) {
      const definition = this.definitions.get(challenge.challengeId);
      if (!definition) continue;

      if (!byCategory[definition.category]) {
        byCategory[definition.category] = { completed: 0, attempted: 0 };
      }

      if (challenge.status === "completed" || challenge.status === "claimed") {
        byCategory[definition.category].completed++;
      }
      if (challenge.status !== "locked" && challenge.status !== "available") {
        byCategory[definition.category].attempted++;
      }
    }

    // Calculate streak (consecutive days with completed challenges)
    // Simplified - would need timestamp analysis in production

    return {
      totalCompleted: completed.length,
      totalClaimed: challenges.filter((c) => c.status === "claimed").length,
      totalPointsEarned: 0, // Calculate from reward history
      currentStreak: 3, // Mock
      longestStreak: 7, // Mock
      completionRate: attempted.length > 0 ? completed.length / attempted.length : 0,
      byCategory,
      recentCompletions: completed
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
        .slice(0, 5),
    };
  }

  // ============================================================================
  // CHALLENGE CREATION (for special events)
  // ============================================================================

  /**
   * Create a special/seasonal challenge
   */
  async createSpecialChallenge(definition: Omit<ChallengeDefinition, "id" | "createdAt" | "updatedAt">): Promise<ChallengeDefinition> {
    const id = `special_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const challenge: ChallengeDefinition = {
      ...definition,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.definitions.set(id, challenge);
    return challenge;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let challengeService: ChallengeService | null = null;

export function getChallengeService(): ChallengeService {
  if (!challengeService) {
    challengeService = new ChallengeService();
  }
  return challengeService;
}

export function createChallengeService(): ChallengeService {
  return new ChallengeService();
}
