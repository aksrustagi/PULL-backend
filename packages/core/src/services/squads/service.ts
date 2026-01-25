/**
 * Squad Mode Service
 * Manages squads, members, and pool funds
 */

import {
  Squad,
  SquadMember,
  SquadRole,
  SquadStatus,
  MemberStatus,
  SquadTier,
  SquadStats,
  PoolContribution,
  SquadLeaderboard,
  CreateSquadRequest,
  CreateSquadResponse,
  InviteMemberRequest,
  JoinSquadRequest,
  UpdateMemberRoleRequest,
  ContributeToPoolRequest,
  GetSquadsRequest,
  GetSquadsResponse,
  SquadEvent,
  MIN_SQUAD_SIZE,
  MAX_SQUAD_SIZE,
  MAX_SQUADS_PER_USER,
} from "./types";

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface SquadsServiceConfig {
  maxSquadsPerUser: number;
  minSquadSize: number;
  maxSquadSize: number;
  minContribution: number;
  maxContribution: number;
  inviteExpiryHours: number;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface ConvexClient {
  query<T>(name: string, args: Record<string, unknown>): Promise<T>;
  mutation<T>(name: string, args: Record<string, unknown>): Promise<T>;
}

interface EventEmitter {
  emit(event: string, data: SquadEvent): void;
}

const DEFAULT_CONFIG: SquadsServiceConfig = {
  maxSquadsPerUser: MAX_SQUADS_PER_USER,
  minSquadSize: MIN_SQUAD_SIZE,
  maxSquadSize: MAX_SQUAD_SIZE,
  minContribution: 10, // $10 minimum
  maxContribution: 10000, // $10,000 maximum
  inviteExpiryHours: 48,
};

// ============================================================================
// SQUADS SERVICE
// ============================================================================

export class SquadsService {
  private readonly config: SquadsServiceConfig;
  private readonly db: ConvexClient;
  private readonly events: EventEmitter;
  private readonly logger: Logger;

  constructor(
    db: ConvexClient,
    events: EventEmitter,
    config?: Partial<SquadsServiceConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.events = events;
    this.logger = config?.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Squads] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Squads] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Squads] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Squads] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // SQUAD CREATION
  // ==========================================================================

  async createSquad(
    userId: string,
    request: CreateSquadRequest
  ): Promise<CreateSquadResponse> {
    // Check user's squad count
    const userSquads = await this.getUserSquads(userId);
    if (userSquads.length >= this.config.maxSquadsPerUser) {
      throw new Error(`Maximum ${this.config.maxSquadsPerUser} squads allowed per user`);
    }

    // Check tag uniqueness
    const existingTag = await this.db.query<Squad | null>("squads:getByTag", {
      tag: request.tag,
    });
    if (existingTag) {
      throw new Error("Squad tag already taken");
    }

    const now = Date.now();
    const squadId = this.generateId();
    const inviteCode = this.generateInviteCode();

    const captainMember: SquadMember = {
      id: this.generateId(),
      squadId,
      userId,
      role: "captain",
      status: "active",
      contributedAmount: 0,
      sharePercent: 100,
      predictionsSubmitted: 0,
      correctPredictions: 0,
      warsParticipated: 0,
      mvpCount: 0,
      joinedAt: now,
      lastActiveAt: now,
    };

    const squad: Squad = {
      id: squadId,
      name: request.name,
      tag: request.tag,
      description: request.description,
      status: "active",
      tier: "bronze",
      captainId: userId,
      members: [captainMember],
      memberCount: 1,
      maxMembers: request.maxMembers,
      isPublic: request.isPublic,
      requiresApproval: request.requiresApproval,
      minKycTier: "none",
      stats: this.initializeStats(),
      seasonStats: {
        seasonId: "season_1",
        seasonName: "Season 1",
        warsWon: 0,
        warsLost: 0,
        points: 0,
        rank: 0,
        tier: "bronze",
      },
      poolBalance: 0,
      poolCurrency: "USD",
      contributionHistory: [],
      createdAt: now,
      updatedAt: now,
    };

    // Save squad and invite code
    await this.db.mutation("squads:create", { squad, inviteCode });

    this.logger.info("Squad created", { squadId, name: request.name, captain: userId });

    return {
      squad,
      inviteCode,
      shareLink: `https://pull.app/squad/${squadId}?invite=${inviteCode}`,
    };
  }

  // ==========================================================================
  // MEMBER MANAGEMENT
  // ==========================================================================

  async inviteMember(
    inviterId: string,
    request: InviteMemberRequest
  ): Promise<SquadMember> {
    const squad = await this.getSquad(request.squadId);
    if (!squad) {
      throw new Error("Squad not found");
    }

    // Check inviter permissions
    const inviter = squad.members.find((m) => m.userId === inviterId);
    if (!inviter || (inviter.role !== "captain" && inviter.role !== "co_captain")) {
      throw new Error("Only captains can invite members");
    }

    // Check squad capacity
    if (squad.memberCount >= squad.maxMembers) {
      throw new Error("Squad is at maximum capacity");
    }

    // Check if user is already a member
    const existingMember = squad.members.find((m) => m.userId === request.userId);
    if (existingMember && existingMember.status === "active") {
      throw new Error("User is already a member");
    }

    // Check user's squad count
    const userSquads = await this.getUserSquads(request.userId);
    if (userSquads.length >= this.config.maxSquadsPerUser) {
      throw new Error("User has maximum squads already");
    }

    const now = Date.now();
    const member: SquadMember = {
      id: this.generateId(),
      squadId: request.squadId,
      userId: request.userId,
      role: request.role,
      status: "invited",
      contributedAmount: 0,
      sharePercent: 0,
      predictionsSubmitted: 0,
      correctPredictions: 0,
      warsParticipated: 0,
      mvpCount: 0,
      joinedAt: now,
      lastActiveAt: now,
    };

    await this.db.mutation("squadMembers:invite", { member });

    // Notify invited user
    await this.notifyInvite(request.userId, squad, inviterId);

    this.logger.info("Member invited", {
      squadId: request.squadId,
      userId: request.userId,
      invitedBy: inviterId,
    });

    return member;
  }

  async joinSquad(userId: string, request: JoinSquadRequest): Promise<SquadMember> {
    let squad: Squad | null = null;

    if (request.inviteCode) {
      // Join via invite code
      const squadId = await this.db.query<string | null>("squadInvites:getSquadId", {
        inviteCode: request.inviteCode,
      });
      if (!squadId) {
        throw new Error("Invalid invite code");
      }
      squad = await this.getSquad(squadId);
    } else if (request.squadId) {
      squad = await this.getSquad(request.squadId);
    }

    if (!squad) {
      throw new Error("Squad not found");
    }

    // Check if squad is public or user was invited
    const existingMember = squad.members.find((m) => m.userId === userId);
    if (existingMember?.status === "active") {
      throw new Error("Already a member of this squad");
    }

    if (!squad.isPublic && (!existingMember || existingMember.status !== "invited")) {
      throw new Error("This squad is private. Request an invite.");
    }

    // Check squad capacity
    if (squad.memberCount >= squad.maxMembers) {
      throw new Error("Squad is at maximum capacity");
    }

    // Check user's squad count
    const userSquads = await this.getUserSquads(userId);
    if (userSquads.length >= this.config.maxSquadsPerUser) {
      throw new Error("You have joined maximum squads already");
    }

    const now = Date.now();
    const member: SquadMember = existingMember
      ? { ...existingMember, status: "active", joinedAt: now, lastActiveAt: now }
      : {
          id: this.generateId(),
          squadId: squad.id,
          userId,
          role: "member",
          status: squad.requiresApproval ? "invited" : "active",
          contributedAmount: 0,
          sharePercent: 0,
          predictionsSubmitted: 0,
          correctPredictions: 0,
          warsParticipated: 0,
          mvpCount: 0,
          joinedAt: now,
          lastActiveAt: now,
        };

    await this.db.mutation("squadMembers:join", { member });

    // Recalculate shares
    await this.recalculateShares(squad.id);

    this.events.emit("squad", {
      type: "member_joined",
      squadId: squad.id,
      member,
    });

    this.logger.info("Member joined", { squadId: squad.id, userId });

    return member;
  }

  async leaveSquad(userId: string, squadId: string): Promise<void> {
    const squad = await this.getSquad(squadId);
    if (!squad) {
      throw new Error("Squad not found");
    }

    const member = squad.members.find((m) => m.userId === userId);
    if (!member || member.status !== "active") {
      throw new Error("Not a member of this squad");
    }

    if (member.role === "captain" && squad.memberCount > 1) {
      throw new Error("Captain must transfer leadership before leaving");
    }

    // Return contributed funds
    if (member.contributedAmount > 0) {
      await this.withdrawFromPool(userId, squadId, member.contributedAmount);
    }

    await this.db.mutation("squadMembers:leave", {
      squadId,
      userId,
    });

    // Recalculate shares
    await this.recalculateShares(squadId);

    // If captain leaves and squad is empty, disband
    if (member.role === "captain" && squad.memberCount === 1) {
      await this.db.mutation("squads:disband", { squadId });
    }

    this.events.emit("squad", {
      type: "member_left",
      squadId,
      userId,
    });

    this.logger.info("Member left", { squadId, userId });
  }

  async kickMember(kickerId: string, squadId: string, memberUserId: string): Promise<void> {
    const squad = await this.getSquad(squadId);
    if (!squad) {
      throw new Error("Squad not found");
    }

    const kicker = squad.members.find((m) => m.userId === kickerId);
    if (!kicker || kicker.role !== "captain") {
      throw new Error("Only captain can kick members");
    }

    const member = squad.members.find((m) => m.userId === memberUserId);
    if (!member || member.status !== "active") {
      throw new Error("Member not found");
    }

    if (member.role === "captain") {
      throw new Error("Cannot kick the captain");
    }

    // Return contributed funds
    if (member.contributedAmount > 0) {
      await this.withdrawFromPool(memberUserId, squadId, member.contributedAmount);
    }

    await this.db.mutation("squadMembers:kick", {
      squadId,
      userId: memberUserId,
    });

    // Recalculate shares
    await this.recalculateShares(squadId);

    this.events.emit("squad", {
      type: "member_left",
      squadId,
      userId: memberUserId,
    });

    this.logger.info("Member kicked", { squadId, memberUserId, kickedBy: kickerId });
  }

  async updateMemberRole(
    userId: string,
    request: UpdateMemberRoleRequest
  ): Promise<SquadMember> {
    const squad = await this.getSquad(request.squadId);
    if (!squad) {
      throw new Error("Squad not found");
    }

    const requester = squad.members.find((m) => m.userId === userId);
    if (!requester || requester.role !== "captain") {
      throw new Error("Only captain can change roles");
    }

    const member = squad.members.find((m) => m.id === request.memberId);
    if (!member || member.status !== "active") {
      throw new Error("Member not found");
    }

    // Transfer captaincy if promoting to captain
    if (request.newRole === "captain") {
      await this.db.mutation("squadMembers:updateRole", {
        squadId: request.squadId,
        memberId: requester.id,
        newRole: "co_captain",
      });
    }

    await this.db.mutation("squadMembers:updateRole", {
      squadId: request.squadId,
      memberId: request.memberId,
      newRole: request.newRole,
    });

    this.events.emit("squad", {
      type: "member_role_changed",
      squadId: request.squadId,
      memberId: request.memberId,
      newRole: request.newRole,
    });

    return { ...member, role: request.newRole };
  }

  // ==========================================================================
  // POOL MANAGEMENT
  // ==========================================================================

  async contributeToPool(
    userId: string,
    request: ContributeToPoolRequest
  ): Promise<PoolContribution> {
    const squad = await this.getSquad(request.squadId);
    if (!squad) {
      throw new Error("Squad not found");
    }

    const member = squad.members.find((m) => m.userId === userId);
    if (!member || member.status !== "active") {
      throw new Error("Not a member of this squad");
    }

    if (request.amount < this.config.minContribution) {
      throw new Error(`Minimum contribution is $${this.config.minContribution}`);
    }

    if (request.amount > this.config.maxContribution) {
      throw new Error(`Maximum contribution is $${this.config.maxContribution}`);
    }

    // Check user balance
    const hasBalance = await this.checkUserBalance(userId, request.amount);
    if (!hasBalance) {
      throw new Error("Insufficient balance");
    }

    // Transfer funds
    await this.transferToPool(userId, request.squadId, request.amount);

    const contribution: PoolContribution = {
      id: this.generateId(),
      squadId: request.squadId,
      userId,
      amount: request.amount,
      type: "deposit",
      description: "Pool contribution",
      createdAt: Date.now(),
    };

    await this.db.mutation("squadContributions:add", { contribution });

    // Recalculate shares
    await this.recalculateShares(request.squadId);

    this.events.emit("squad", {
      type: "pool_contribution",
      squadId: request.squadId,
      contribution,
    });

    this.logger.info("Pool contribution", {
      squadId: request.squadId,
      userId,
      amount: request.amount,
    });

    return contribution;
  }

  async withdrawFromPool(
    userId: string,
    squadId: string,
    amount: number
  ): Promise<PoolContribution> {
    const squad = await this.getSquad(squadId);
    if (!squad) {
      throw new Error("Squad not found");
    }

    const member = squad.members.find((m) => m.userId === userId);
    if (!member || member.status !== "active") {
      throw new Error("Not a member of this squad");
    }

    // Calculate user's share of the pool
    const maxWithdrawal = (squad.poolBalance * member.sharePercent) / 100;
    if (amount > maxWithdrawal) {
      throw new Error(`Maximum withdrawal is $${maxWithdrawal.toFixed(2)}`);
    }

    // Transfer funds
    await this.transferFromPool(userId, squadId, amount);

    const contribution: PoolContribution = {
      id: this.generateId(),
      squadId,
      userId,
      amount: -amount,
      type: "withdrawal",
      description: "Pool withdrawal",
      createdAt: Date.now(),
    };

    await this.db.mutation("squadContributions:add", { contribution });

    // Recalculate shares
    await this.recalculateShares(squadId);

    this.logger.info("Pool withdrawal", { squadId, userId, amount });

    return contribution;
  }

  private async recalculateShares(squadId: string): Promise<void> {
    const squad = await this.getSquad(squadId);
    if (!squad) return;

    const activeMembers = squad.members.filter((m) => m.status === "active");
    const totalContributed = activeMembers.reduce((sum, m) => sum + m.contributedAmount, 0);

    if (totalContributed === 0) {
      // Equal shares if no contributions
      const equalShare = 100 / activeMembers.length;
      for (const member of activeMembers) {
        await this.db.mutation("squadMembers:updateShare", {
          memberId: member.id,
          sharePercent: equalShare,
        });
      }
    } else {
      // Proportional shares based on contribution
      for (const member of activeMembers) {
        const share = (member.contributedAmount / totalContributed) * 100;
        await this.db.mutation("squadMembers:updateShare", {
          memberId: member.id,
          sharePercent: share,
        });
      }
    }
  }

  // ==========================================================================
  // RETRIEVAL
  // ==========================================================================

  async getSquad(squadId: string): Promise<Squad | null> {
    return await this.db.query<Squad | null>("squads:get", { squadId });
  }

  async getSquadByTag(tag: string): Promise<Squad | null> {
    return await this.db.query<Squad | null>("squads:getByTag", { tag });
  }

  async getSquads(request: GetSquadsRequest): Promise<GetSquadsResponse> {
    const result = await this.db.query<{ squads: Squad[]; nextCursor?: string }>(
      "squads:list",
      request
    );

    return {
      squads: result.squads,
      nextCursor: result.nextCursor,
      hasMore: !!result.nextCursor,
    };
  }

  async getUserSquads(userId: string): Promise<Squad[]> {
    return await this.db.query<Squad[]>("squads:getByUser", { userId });
  }

  async searchSquads(query: string, limit: number = 20): Promise<Squad[]> {
    return await this.db.query<Squad[]>("squads:search", { query, limit });
  }

  // ==========================================================================
  // LEADERBOARDS
  // ==========================================================================

  async getLeaderboard(
    period: "daily" | "weekly" | "monthly" | "season" | "all_time",
    limit: number = 100
  ): Promise<SquadLeaderboard> {
    return await this.db.query<SquadLeaderboard>("squadLeaderboards:get", {
      period,
      limit,
    });
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private initializeStats(): SquadStats {
    return {
      totalWars: 0,
      warsWon: 0,
      warsLost: 0,
      warsTied: 0,
      winRate: 0,
      currentStreak: 0,
      longestStreak: 0,
      totalPredictions: 0,
      correctPredictions: 0,
      predictionAccuracy: 0,
      totalEarnings: 0,
      totalContributed: 0,
      netProfit: 0,
      rank: 0,
      eloRating: 1000,
    };
  }

  private async checkUserBalance(userId: string, amount: number): Promise<boolean> {
    const balance = await this.db.query<{ available: number }>("balances:get", {
      userId,
      assetType: "usd",
    });
    return balance ? balance.available >= amount : false;
  }

  private async transferToPool(
    userId: string,
    squadId: string,
    amount: number
  ): Promise<void> {
    await this.db.mutation("balances:transfer", {
      fromUserId: userId,
      toSquadId: squadId,
      amount,
    });
  }

  private async transferFromPool(
    userId: string,
    squadId: string,
    amount: number
  ): Promise<void> {
    await this.db.mutation("balances:transfer", {
      fromSquadId: squadId,
      toUserId: userId,
      amount,
    });
  }

  private async notifyInvite(
    userId: string,
    squad: Squad,
    inviterId: string
  ): Promise<void> {
    await this.db.mutation("notifications:create", {
      userId,
      type: "squad_invite",
      title: "Squad Invitation!",
      body: `You've been invited to join ${squad.name}`,
      data: { squadId: squad.id, inviterId },
      createdAt: Date.now(),
    });
  }

  private generateId(): string {
    return `squad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateInviteCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let serviceInstance: SquadsService | null = null;

export function getSquadsService(
  db: ConvexClient,
  events: EventEmitter
): SquadsService {
  if (!serviceInstance) {
    serviceInstance = new SquadsService(db, events);
  }
  return serviceInstance;
}

export function createSquadsService(
  db: ConvexClient,
  events: EventEmitter,
  config?: Partial<SquadsServiceConfig>
): SquadsService {
  return new SquadsService(db, events, config);
}
