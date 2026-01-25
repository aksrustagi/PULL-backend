/**
 * Watch Party Service
 * Create and manage watch parties with group betting
 */

import {
  WatchParty,
  WatchPartyStatus,
  PartyType,
  PartyRole,
  PartyMember,
  PartyInvite,
  PartyMessage,
  MessageType,
  GroupBet,
  SharedBetSlip,
  PartyPoll,
  PartyPrediction,
  GameSyncState,
  CreatePartyParams,
  JoinPartyParams,
  SendMessageParams,
  CreateGroupBetParams,
  ContributeToGroupBetParams,
  CreatePollParams,
  SyncStateParams,
  PartySettings,
  WATCH_PARTY_DEFAULTS,
  PARTY_ROLE_PERMISSIONS,
} from "./types";
import { GameSyncManager, gameSyncManager } from "./sync";
import { GroupBettingManager, groupBettingManager } from "./betting";

// ============================================================================
// Configuration
// ============================================================================

export interface WatchPartyServiceConfig {
  maxPartiesPerUser: number;
  maxMessagesPerMinute: number;
  messageRetentionHours: number;
  defaultMaxParticipants: number;
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

const DEFAULT_CONFIG: WatchPartyServiceConfig = {
  maxPartiesPerUser: 3,
  maxMessagesPerMinute: 20,
  messageRetentionHours: 24,
  defaultMaxParticipants: WATCH_PARTY_DEFAULTS.maxParticipants,
};

// ============================================================================
// Watch Party Service
// ============================================================================

export class WatchPartyService {
  private readonly config: WatchPartyServiceConfig;
  private readonly db: ConvexClient;
  private readonly logger: Logger;
  private readonly syncManager: GameSyncManager;
  private readonly bettingManager: GroupBettingManager;

  constructor(db: ConvexClient, config?: Partial<WatchPartyServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db;
    this.logger = config?.logger ?? this.createDefaultLogger();
    this.syncManager = gameSyncManager;
    this.bettingManager = groupBettingManager;
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[WatchParty] ${msg}`, meta),
      info: (msg, meta) => console.info(`[WatchParty] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[WatchParty] ${msg}`, meta),
      error: (msg, meta) => console.error(`[WatchParty] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Party Management
  // ==========================================================================

  /**
   * Create a new watch party
   */
  async createParty(params: CreatePartyParams): Promise<WatchParty> {
    const { hostId, settings, ...partyData } = params;

    // Check user's active parties
    const activeParties = await this.db.query<{ count: number }>(
      "watchParties:countByHost",
      { hostId, status: ["scheduled", "waiting", "live"] }
    );

    if (activeParties.count >= this.config.maxPartiesPerUser) {
      throw new Error(`Maximum of ${this.config.maxPartiesPerUser} active parties allowed`);
    }

    // Get host username
    const host = await this.db.query<{ username: string } | null>(
      "users:getById",
      { id: hostId }
    );

    const now = new Date();
    const partyId = `party_${Date.now()}_${hostId}`;
    const inviteCode = this.generateInviteCode();

    const defaultSettings: PartySettings = {
      autoSync: true,
      syncTolerance: WATCH_PARTY_DEFAULTS.syncTolerance,
      chatDelay: WATCH_PARTY_DEFAULTS.chatDelay,
      slowMode: false,
      slowModeInterval: WATCH_PARTY_DEFAULTS.slowModeInterval,
      membersCanInvite: true,
      requireApproval: false,
      minAccountAge: 0,
      blockedUsers: [],
      mutedUsers: [],
      ...settings,
    };

    const party: WatchParty = {
      id: partyId,
      hostId,
      hostUsername: host?.username || "anonymous",
      name: partyData.name,
      description: partyData.description,
      type: partyData.type,
      status: "scheduled",
      eventId: partyData.eventId,
      eventType: partyData.eventType,
      eventName: partyData.eventName,
      sport: partyData.sport,
      league: partyData.league,
      homeTeam: partyData.homeTeam,
      awayTeam: partyData.awayTeam,
      scheduledStart: partyData.scheduledStart,
      maxParticipants: partyData.maxParticipants ?? this.config.defaultMaxParticipants,
      currentParticipants: 1, // Host
      inviteCode,
      inviteOnly: partyData.inviteOnly ?? false,
      chatEnabled: true,
      bettingEnabled: true,
      groupBetEnabled: true,
      statsOverlayEnabled: true,
      predictionsEnabled: true,
      pollsEnabled: true,
      groupBetPool: 0,
      groupBetContributors: 0,
      settings: defaultSettings,
      totalMessages: 0,
      totalBetsPlaced: 0,
      totalBetVolume: 0,
      peakViewers: 1,
      createdAt: now,
      updatedAt: now,
    };

    // Save party
    await this.db.mutation("watchParties:create", {
      ...party,
      scheduledStart: partyData.scheduledStart.getTime(),
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    });

    // Add host as member
    await this.addMember(partyId, hostId, "host");

    this.logger.info("Watch party created", {
      partyId,
      hostId,
      eventId: partyData.eventId,
    });

    return party;
  }

  /**
   * Update party settings
   */
  async updateParty(
    partyId: string,
    userId: string,
    updates: Partial<Pick<WatchParty, "name" | "description" | "settings" | "maxParticipants">>
  ): Promise<WatchParty> {
    const party = await this.getParty(partyId);
    if (!party) {
      throw new Error("Party not found");
    }

    // Check permissions
    if (!await this.hasPermission(partyId, userId, "manage_party")) {
      throw new Error("Not authorized to update party");
    }

    const now = Date.now();
    await this.db.mutation("watchParties:update", {
      id: partyId,
      ...updates,
      updatedAt: now,
    });

    return { ...party, ...updates, updatedAt: new Date(now) };
  }

  /**
   * Start the party (go live)
   */
  async startParty(partyId: string, userId: string): Promise<WatchParty> {
    const party = await this.getParty(partyId);
    if (!party) {
      throw new Error("Party not found");
    }

    if (!await this.hasPermission(partyId, userId, "manage_party")) {
      throw new Error("Not authorized to start party");
    }

    if (!["scheduled", "waiting"].includes(party.status)) {
      throw new Error("Party cannot be started in current status");
    }

    const now = Date.now();

    // Start game sync
    await this.syncManager.startSync({
      partyId,
      eventId: party.eventId,
    });

    // Update party status
    await this.db.mutation("watchParties:update", {
      id: partyId,
      status: "live",
      actualStart: now,
      updatedAt: now,
    });

    // Broadcast party start
    await this.sendSystemMessage(partyId, "The watch party has started! Enjoy the game!");

    this.logger.info("Watch party started", { partyId, hostId: userId });

    return {
      ...party,
      status: "live",
      actualStart: new Date(now),
      updatedAt: new Date(now),
    };
  }

  /**
   * End the party
   */
  async endParty(partyId: string, userId: string): Promise<WatchParty> {
    const party = await this.getParty(partyId);
    if (!party) {
      throw new Error("Party not found");
    }

    if (!await this.hasPermission(partyId, userId, "end_party")) {
      throw new Error("Not authorized to end party");
    }

    const now = Date.now();

    // Stop game sync
    this.syncManager.stopSync(partyId);

    // Update party status
    await this.db.mutation("watchParties:update", {
      id: partyId,
      status: "ended",
      endedAt: now,
      updatedAt: now,
    });

    // Broadcast party end
    await this.sendSystemMessage(partyId, "The watch party has ended. Thanks for joining!");

    this.logger.info("Watch party ended", { partyId, hostId: userId });

    return {
      ...party,
      status: "ended",
      endedAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  // ==========================================================================
  // Member Management
  // ==========================================================================

  /**
   * Join a watch party
   */
  async joinParty(params: JoinPartyParams): Promise<PartyMember> {
    const { partyId, userId, inviteCode } = params;

    const party = await this.getParty(partyId);
    if (!party) {
      throw new Error("Party not found");
    }

    // Check party status
    if (!["scheduled", "waiting", "live"].includes(party.status)) {
      throw new Error("Party is not accepting participants");
    }

    // Check capacity
    if (party.currentParticipants >= party.maxParticipants) {
      throw new Error("Party is full");
    }

    // Check invite code if required
    if (party.inviteOnly) {
      if (!inviteCode || inviteCode !== party.inviteCode) {
        throw new Error("Invalid invite code");
      }
    }

    // Check if already a member
    const existing = await this.db.query<PartyMember | null>(
      "partyMembers:getByUserAndParty",
      { userId, partyId }
    );
    if (existing && !existing.leftAt) {
      throw new Error("Already a member of this party");
    }

    // Check blocked users
    if (party.settings.blockedUsers.includes(userId)) {
      throw new Error("You are blocked from this party");
    }

    // Add as member
    const member = await this.addMember(partyId, userId, "member");

    // Update party count
    await this.db.mutation("watchParties:incrementParticipants", {
      id: partyId,
      count: 1,
    });

    // Update peak viewers if needed
    if (party.currentParticipants + 1 > party.peakViewers) {
      await this.db.mutation("watchParties:update", {
        id: partyId,
        peakViewers: party.currentParticipants + 1,
      });
    }

    // Broadcast join message
    await this.sendSystemMessage(partyId, `${member.displayName} joined the party`);

    this.logger.info("User joined watch party", { partyId, userId });

    return member;
  }

  /**
   * Leave a watch party
   */
  async leaveParty(partyId: string, userId: string): Promise<void> {
    const member = await this.db.query<PartyMember | null>(
      "partyMembers:getByUserAndParty",
      { userId, partyId }
    );

    if (!member || member.leftAt) {
      throw new Error("Not a member of this party");
    }

    const now = Date.now();

    // Update member record
    await this.db.mutation("partyMembers:update", {
      id: member.id,
      leftAt: now,
      status: "disconnected",
    });

    // Decrement party count
    await this.db.mutation("watchParties:incrementParticipants", {
      id: partyId,
      count: -1,
    });

    // Broadcast leave message
    await this.sendSystemMessage(partyId, `${member.displayName} left the party`);

    this.logger.info("User left watch party", { partyId, userId });
  }

  /**
   * Add member to party
   */
  private async addMember(
    partyId: string,
    userId: string,
    role: PartyRole
  ): Promise<PartyMember> {
    const user = await this.db.query<{ username: string; displayName: string; avatarUrl?: string } | null>(
      "users:getById",
      { id: userId }
    );

    const now = new Date();
    const member: PartyMember = {
      id: `pm_${Date.now()}_${userId}`,
      partyId,
      userId,
      username: user?.username || "anonymous",
      displayName: user?.displayName || "Anonymous",
      avatarUrl: user?.avatarUrl,
      role,
      status: "active",
      syncStatus: "synced",
      lastActive: now,
      joinedAt: now,
      messagesCount: 0,
      betsPlaced: 0,
      betVolume: 0,
      reactions: 0,
      groupBetContribution: 0,
      groupBetShare: 0,
    };

    await this.db.mutation("partyMembers:create", {
      ...member,
      lastActive: now.getTime(),
      joinedAt: now.getTime(),
    });

    return member;
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    partyId: string,
    adminId: string,
    targetUserId: string,
    newRole: PartyRole
  ): Promise<void> {
    if (!await this.hasPermission(partyId, adminId, "manage_members")) {
      throw new Error("Not authorized to manage members");
    }

    await this.db.mutation("partyMembers:updateRole", {
      partyId,
      userId: targetUserId,
      role: newRole,
      updatedAt: Date.now(),
    });
  }

  // ==========================================================================
  // Chat
  // ==========================================================================

  /**
   * Send a message to party chat
   */
  async sendMessage(params: SendMessageParams): Promise<PartyMessage> {
    const { partyId, userId, type, content, metadata, replyToId } = params;

    const party = await this.getParty(partyId);
    if (!party) {
      throw new Error("Party not found");
    }

    if (!party.chatEnabled) {
      throw new Error("Chat is disabled for this party");
    }

    // Check membership
    const member = await this.db.query<PartyMember | null>(
      "partyMembers:getByUserAndParty",
      { userId, partyId }
    );
    if (!member || member.leftAt) {
      throw new Error("Not a member of this party");
    }

    // Check permissions
    if (!await this.hasPermission(partyId, userId, "send_messages")) {
      throw new Error("Not authorized to send messages");
    }

    // Check mute status
    if (party.settings.mutedUsers.includes(userId)) {
      throw new Error("You are muted in this party");
    }

    // Check slow mode
    if (party.settings.slowMode) {
      const lastMessage = await this.db.query<PartyMessage | null>(
        "partyMessages:getLastByUser",
        { partyId, userId }
      );
      if (lastMessage) {
        const timeSince = Date.now() - lastMessage.createdAt.getTime();
        if (timeSince < party.settings.slowModeInterval * 1000) {
          throw new Error(`Slow mode: wait ${Math.ceil((party.settings.slowModeInterval * 1000 - timeSince) / 1000)} seconds`);
        }
      }
    }

    const syncState = this.syncManager.getSyncState(partyId);

    const message: PartyMessage = {
      id: `msg_${Date.now()}_${userId}`,
      partyId,
      userId,
      username: member.username,
      avatarUrl: member.avatarUrl,
      type,
      content,
      metadata,
      replyToId,
      reactions: [],
      reactionCounts: {},
      isDeleted: false,
      isPinned: false,
      createdAt: new Date(),
      gameTime: syncState?.gameTime,
    };

    // Apply chat delay if configured
    const effectiveTimestamp = party.settings.chatDelay > 0
      ? Date.now() + party.settings.chatDelay * 1000
      : Date.now();

    await this.db.mutation("partyMessages:create", {
      ...message,
      createdAt: effectiveTimestamp,
    });

    // Update member message count
    await this.db.mutation("partyMembers:incrementMessages", {
      id: member.id,
    });

    // Update party message count
    await this.db.mutation("watchParties:incrementMessages", {
      id: partyId,
    });

    return message;
  }

  /**
   * Send system message
   */
  private async sendSystemMessage(partyId: string, content: string): Promise<void> {
    const message: PartyMessage = {
      id: `msg_${Date.now()}_system`,
      partyId,
      userId: "system",
      username: "System",
      type: "system",
      content,
      reactions: [],
      reactionCounts: {},
      isDeleted: false,
      isPinned: false,
      createdAt: new Date(),
    };

    await this.db.mutation("partyMessages:create", {
      ...message,
      createdAt: Date.now(),
    });
  }

  /**
   * Get messages for party
   */
  async getMessages(
    partyId: string,
    params?: { limit?: number; before?: Date }
  ): Promise<PartyMessage[]> {
    return await this.db.query("partyMessages:getByParty", {
      partyId,
      limit: params?.limit ?? 50,
      before: params?.before?.getTime(),
    });
  }

  // ==========================================================================
  // Group Betting
  // ==========================================================================

  /**
   * Create a group bet
   */
  async createGroupBet(params: CreateGroupBetParams): Promise<GroupBet> {
    const { partyId, creatorId } = params;

    const party = await this.getParty(partyId);
    if (!party) {
      throw new Error("Party not found");
    }

    if (!party.groupBetEnabled) {
      throw new Error("Group betting is disabled for this party");
    }

    if (!await this.hasPermission(partyId, creatorId, "create_group_bet")) {
      throw new Error("Not authorized to create group bets");
    }

    // Get creator username
    const member = await this.db.query<PartyMember | null>(
      "partyMembers:getByUserAndParty",
      { userId: creatorId, partyId }
    );

    // Create group bet
    const groupBet = this.bettingManager.createGroupBet(params);
    groupBet.creatorUsername = member?.username || "anonymous";

    // Save to database
    await this.db.mutation("groupBets:create", {
      ...groupBet,
      deadline: params.deadline.getTime(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Announce in chat
    await this.sendMessage({
      partyId,
      userId: creatorId,
      type: "bet_proposal",
      content: `Created a group bet: ${params.selection} @ ${params.odds}`,
      metadata: {
        proposalId: groupBet.id,
        proposalType: "group",
        proposalAmount: params.targetAmount,
        proposalExpires: params.deadline,
      },
    });

    this.logger.info("Group bet created", {
      groupBetId: groupBet.id,
      partyId,
      creatorId,
    });

    return groupBet;
  }

  /**
   * Contribute to group bet
   */
  async contributeToGroupBet(params: ContributeToGroupBetParams): Promise<{
    contribution: { userId: string; amount: number };
    isFilled: boolean;
  }> {
    const { groupBetId, userId, amount } = params;

    const groupBet = await this.db.query<GroupBet | null>(
      "groupBets:getById",
      { id: groupBetId }
    );
    if (!groupBet) {
      throw new Error("Group bet not found");
    }

    // Check user balance
    const balance = await this.db.query<{ available: number } | null>(
      "balances:getByUserAsset",
      { userId, assetType: "usd", assetId: "usd" }
    );
    if (!balance || balance.available < amount) {
      throw new Error("Insufficient balance");
    }

    // Get member info
    const member = await this.db.query<PartyMember | null>(
      "partyMembers:getByUserAndParty",
      { userId, partyId: groupBet.partyId }
    );

    // Add contribution
    const result = this.bettingManager.addContribution(groupBet, {
      groupBetId,
      userId,
      amount,
      username: member?.username || "anonymous",
    });

    // Deduct from balance
    await this.db.mutation("balances:debit", {
      userId,
      assetType: "usd",
      assetId: "usd",
      amount,
      reason: "group_bet_contribution",
      referenceId: groupBetId,
    });

    // Update group bet in database
    await this.db.mutation("groupBets:update", {
      id: groupBetId,
      currentAmount: result.groupBet.currentAmount,
      contributions: result.groupBet.contributions,
      updatedAt: Date.now(),
    });

    // Update member stats
    await this.db.mutation("partyMembers:incrementGroupBet", {
      id: member?.id,
      contribution: amount,
    });

    // If filled, lock the bet
    if (result.isFilled) {
      await this.lockAndPlaceGroupBet(groupBetId);
    }

    this.logger.info("Group bet contribution added", {
      groupBetId,
      userId,
      amount,
      isFilled: result.isFilled,
    });

    return {
      contribution: result.contribution,
      isFilled: result.isFilled,
    };
  }

  /**
   * Lock and place group bet
   */
  private async lockAndPlaceGroupBet(groupBetId: string): Promise<void> {
    const groupBet = await this.db.query<GroupBet | null>(
      "groupBets:getById",
      { id: groupBetId }
    );
    if (!groupBet) return;

    // Lock the bet
    const lockedBet = this.bettingManager.lockGroupBet(groupBet);

    // Place the actual bet (would call betting service)
    const actualOdds = groupBet.odds; // Would get from market

    const placedBet = this.bettingManager.markBetPlaced(lockedBet, actualOdds);

    // Update in database
    await this.db.mutation("groupBets:update", {
      id: groupBetId,
      ...placedBet,
      placedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Update party stats
    await this.db.mutation("watchParties:incrementBetting", {
      id: groupBet.partyId,
      volume: groupBet.currentAmount,
    });

    // Announce in chat
    await this.sendSystemMessage(
      groupBet.partyId,
      `Group bet placed! ${groupBet.contributions.length} contributors pooled $${groupBet.currentAmount} on ${groupBet.selection}`
    );
  }

  // ==========================================================================
  // Polls
  // ==========================================================================

  /**
   * Create a poll
   */
  async createPoll(params: CreatePollParams): Promise<PartyPoll> {
    const { partyId, creatorId, question, options, allowMultiple, anonymous, expiresIn } = params;

    if (!await this.hasPermission(partyId, creatorId, "create_poll")) {
      throw new Error("Not authorized to create polls");
    }

    const member = await this.db.query<PartyMember | null>(
      "partyMembers:getByUserAndParty",
      { userId: creatorId, partyId }
    );

    const now = new Date();
    const poll: PartyPoll = {
      id: `poll_${Date.now()}_${partyId}`,
      partyId,
      creatorId,
      creatorUsername: member?.username || "anonymous",
      question,
      options: options.map((text, i) => ({
        id: `opt_${i}`,
        text,
        votes: 0,
        percent: 0,
        voters: anonymous ? undefined : [],
      })),
      allowMultiple: allowMultiple ?? false,
      anonymous: anonymous ?? false,
      status: "active",
      expiresAt: expiresIn ? new Date(now.getTime() + expiresIn * 1000) : undefined,
      totalVotes: 0,
      createdAt: now,
    };

    await this.db.mutation("partyPolls:create", {
      ...poll,
      expiresAt: poll.expiresAt?.getTime(),
      createdAt: now.getTime(),
    });

    // Announce in chat
    await this.sendMessage({
      partyId,
      userId: creatorId,
      type: "poll",
      content: question,
      metadata: {
        pollId: poll.id,
        pollQuestion: question,
        pollOptions: options,
      },
    });

    return poll;
  }

  /**
   * Vote on a poll
   */
  async voteOnPoll(
    pollId: string,
    userId: string,
    optionIds: string[]
  ): Promise<PartyPoll> {
    const poll = await this.db.query<PartyPoll | null>(
      "partyPolls:getById",
      { id: pollId }
    );
    if (!poll) {
      throw new Error("Poll not found");
    }

    if (poll.status !== "active") {
      throw new Error("Poll is not active");
    }

    if (poll.expiresAt && new Date() > poll.expiresAt) {
      throw new Error("Poll has expired");
    }

    // Check if already voted (for non-anonymous polls)
    if (!poll.anonymous) {
      for (const option of poll.options) {
        if (option.voters?.includes(userId)) {
          throw new Error("Already voted on this poll");
        }
      }
    }

    // Validate options
    if (!poll.allowMultiple && optionIds.length > 1) {
      throw new Error("Multiple selections not allowed");
    }

    // Update votes
    const updatedOptions = poll.options.map(option => {
      if (optionIds.includes(option.id)) {
        return {
          ...option,
          votes: option.votes + 1,
          voters: option.voters ? [...option.voters, userId] : undefined,
        };
      }
      return option;
    });

    const totalVotes = poll.totalVotes + optionIds.length;

    // Recalculate percentages
    const finalOptions = updatedOptions.map(option => ({
      ...option,
      percent: totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0,
    }));

    await this.db.mutation("partyPolls:update", {
      id: pollId,
      options: finalOptions,
      totalVotes,
      updatedAt: Date.now(),
    });

    return { ...poll, options: finalOptions, totalVotes };
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * Get party by ID
   */
  async getParty(partyId: string): Promise<WatchParty | null> {
    return await this.db.query("watchParties:getById", { id: partyId });
  }

  /**
   * Get parties for an event
   */
  async getPartiesForEvent(eventId: string): Promise<WatchParty[]> {
    return await this.db.query("watchParties:getByEvent", {
      eventId,
      status: ["scheduled", "waiting", "live"],
    });
  }

  /**
   * Get user's parties
   */
  async getUserParties(userId: string): Promise<WatchParty[]> {
    return await this.db.query("watchParties:getByMember", { userId });
  }

  /**
   * Get sync state
   */
  getSyncState(partyId: string): GameSyncState | null {
    return this.syncManager.getSyncState(partyId);
  }

  // ==========================================================================
  // Permissions
  // ==========================================================================

  /**
   * Check if user has permission
   */
  async hasPermission(
    partyId: string,
    userId: string,
    permission: string
  ): Promise<boolean> {
    const member = await this.db.query<PartyMember | null>(
      "partyMembers:getByUserAndParty",
      { userId, partyId }
    );

    if (!member || member.leftAt) {
      return false;
    }

    const rolePermissions = PARTY_ROLE_PERMISSIONS[member.role];
    return rolePermissions.includes(permission);
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private generateInviteCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

export default WatchPartyService;
