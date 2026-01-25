/**
 * NUCLEAR GROWTH FEATURE #2: Live Betting Rooms
 *
 * Clubhouse/Twitter Spaces style audio rooms for live betting.
 * Watch games together, share picks in real-time, build community.
 *
 * WHY IT'S NUCLEAR:
 * - Real-time social creates addiction
 * - Audio is intimate and sticky
 * - Expert tipsters can monetize
 * - Creates community around events
 */

import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export const RoomTypeSchema = z.enum([
  "public",       // Anyone can join
  "followers",    // Only followers
  "private",      // Invite only
  "premium",      // Paid entry
  "vip",          // Top-tier subscribers
]);

export type RoomType = z.infer<typeof RoomTypeSchema>;

export const ParticipantRoleSchema = z.enum([
  "host",         // Room creator
  "co_host",      // Can manage speakers
  "speaker",      // Can talk
  "listener",     // Can only listen
  "muted",        // Temporarily muted
]);

export type ParticipantRole = z.infer<typeof ParticipantRoleSchema>;

export interface LiveRoom {
  id: string;
  title: string;
  description?: string;
  type: RoomType;

  // Event context
  sport?: string;
  league?: string;
  gameId?: string;
  eventName?: string;

  // Host info
  hostId: string;
  hostUsername: string;
  hostAvatarUrl?: string;
  coHostIds: string[];

  // Participants
  participants: RoomParticipant[];
  maxParticipants: number;
  speakerQueue: string[]; // User IDs waiting to speak

  // Content
  pinnedBet?: PinnedBet;
  sharedBets: SharedBet[];
  polls: RoomPoll[];
  reactions: RoomReaction[];

  // Monetization
  entryFee?: number;
  tipJarEnabled: boolean;
  totalTips: number;

  // Stats
  peakListeners: number;
  totalReactions: number;
  betsShared: number;

  // Recording
  isRecording: boolean;
  recordingUrl?: string;

  // Status
  status: "scheduled" | "live" | "ended";
  scheduledFor?: number;
  startedAt?: number;
  endedAt?: number;
  createdAt: number;
}

export interface RoomParticipant {
  userId: string;
  username: string;
  avatarUrl?: string;
  role: ParticipantRole;
  isMuted: boolean;
  isSpeaking: boolean;

  // Stats in room
  betsShared: number;
  tipsReceived: number;
  reactionsReceived: number;

  joinedAt: number;
}

export interface PinnedBet {
  userId: string;
  username: string;
  betId: string;
  description: string;
  odds: number;
  amount?: number;
  pinnedAt: number;
}

export interface SharedBet {
  id: string;
  oduserId: string;
  username: string;
  betId: string;
  description: string;
  odds: number;
  amount?: number;
  tails: number; // How many people tailed
  fades: number; // How many people faded
  result?: "pending" | "won" | "lost" | "pushed";
  sharedAt: number;
}

export interface RoomPoll {
  id: string;
  question: string;
  options: Array<{
    id: string;
    text: string;
    votes: number;
  }>;
  createdBy: string;
  endsAt: number;
  isActive: boolean;
}

export interface RoomReaction {
  emoji: string;
  count: number;
  lastTriggered: number;
}

export interface RoomSchedule {
  id: string;
  roomId: string;
  title: string;
  description?: string;
  sport?: string;
  eventName?: string;
  scheduledFor: number;
  hostId: string;
  hostUsername: string;
  reminders: string[]; // User IDs who want reminders
}

export interface RoomTip {
  id: string;
  roomId: string;
  fromUserId: string;
  fromUsername: string;
  toUserId: string;
  toUsername: string;
  amount: number;
  message?: string;
  createdAt: number;
}

export interface RoomInvite {
  id: string;
  roomId: string;
  inviterId: string;
  inviteCode: string;
  maxUses?: number;
  uses: number;
  expiresAt?: number;
  createdAt: number;
}

// ============================================================================
// LIVE ROOMS SERVICE
// ============================================================================

export class LiveRoomsService {
  /**
   * Create a new live room
   */
  createRoom(
    hostId: string,
    hostUsername: string,
    title: string,
    options: {
      description?: string;
      type?: RoomType;
      sport?: string;
      league?: string;
      gameId?: string;
      eventName?: string;
      scheduledFor?: number;
      maxParticipants?: number;
      entryFee?: number;
      tipJarEnabled?: boolean;
    } = {}
  ): LiveRoom {
    const now = Date.now();
    const isScheduled = options.scheduledFor && options.scheduledFor > now;

    return {
      id: `room_${now}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      description: options.description,
      type: options.type ?? "public",
      sport: options.sport,
      league: options.league,
      gameId: options.gameId,
      eventName: options.eventName,
      hostId,
      hostUsername,
      coHostIds: [],
      participants: [{
        userId: hostId,
        username: hostUsername,
        role: "host",
        isMuted: false,
        isSpeaking: false,
        betsShared: 0,
        tipsReceived: 0,
        reactionsReceived: 0,
        joinedAt: now,
      }],
      maxParticipants: options.maxParticipants ?? 1000,
      speakerQueue: [],
      sharedBets: [],
      polls: [],
      reactions: [],
      entryFee: options.entryFee,
      tipJarEnabled: options.tipJarEnabled ?? true,
      totalTips: 0,
      peakListeners: 1,
      totalReactions: 0,
      betsShared: 0,
      isRecording: false,
      status: isScheduled ? "scheduled" : "live",
      scheduledFor: options.scheduledFor,
      startedAt: isScheduled ? undefined : now,
      createdAt: now,
    };
  }

  /**
   * Join a room
   */
  joinRoom(
    room: LiveRoom,
    userId: string,
    username: string,
    avatarUrl?: string
  ): { room: LiveRoom; error?: string } {
    // Check capacity
    if (room.participants.length >= room.maxParticipants) {
      return { room, error: "Room is full" };
    }

    // Check if already in room
    if (room.participants.some(p => p.userId === userId)) {
      return { room, error: "Already in room" };
    }

    const newParticipant: RoomParticipant = {
      userId,
      username,
      avatarUrl,
      role: "listener",
      isMuted: true,
      isSpeaking: false,
      betsShared: 0,
      tipsReceived: 0,
      reactionsReceived: 0,
      joinedAt: Date.now(),
    };

    const updatedRoom: LiveRoom = {
      ...room,
      participants: [...room.participants, newParticipant],
      peakListeners: Math.max(room.peakListeners, room.participants.length + 1),
    };

    return { room: updatedRoom };
  }

  /**
   * Leave room
   */
  leaveRoom(room: LiveRoom, userId: string): LiveRoom {
    return {
      ...room,
      participants: room.participants.filter(p => p.userId !== userId),
      speakerQueue: room.speakerQueue.filter(id => id !== userId),
    };
  }

  /**
   * Request to speak
   */
  requestToSpeak(room: LiveRoom, userId: string): LiveRoom {
    if (room.speakerQueue.includes(userId)) {
      return room;
    }

    return {
      ...room,
      speakerQueue: [...room.speakerQueue, userId],
    };
  }

  /**
   * Promote to speaker
   */
  promoteToSpeaker(room: LiveRoom, userId: string, promoterId: string): LiveRoom {
    // Check promoter is host or co-host
    const promoter = room.participants.find(p => p.userId === promoterId);
    if (!promoter || (promoter.role !== "host" && promoter.role !== "co_host")) {
      return room;
    }

    return {
      ...room,
      participants: room.participants.map(p =>
        p.userId === userId ? { ...p, role: "speaker" as ParticipantRole, isMuted: false } : p
      ),
      speakerQueue: room.speakerQueue.filter(id => id !== userId),
    };
  }

  /**
   * Share a bet in the room
   */
  shareBet(
    room: LiveRoom,
    userId: string,
    username: string,
    bet: {
      betId: string;
      description: string;
      odds: number;
      amount?: number;
    }
  ): LiveRoom {
    const sharedBet: SharedBet = {
      id: `shared_${Date.now()}`,
      oduserId: oduserId,
      username,
      betId: bet.betId,
      description: bet.description,
      odds: bet.odds,
      amount: bet.amount,
      tails: 0,
      fades: 0,
      sharedAt: Date.now(),
    };

    return {
      ...room,
      sharedBets: [sharedBet, ...room.sharedBets].slice(0, 100), // Keep last 100
      betsShared: room.betsShared + 1,
      participants: room.participants.map(p =>
        p.userId === userId ? { ...p, betsShared: p.betsShared + 1 } : p
      ),
    };
  }

  /**
   * Pin a bet
   */
  pinBet(room: LiveRoom, userId: string, username: string, bet: {
    betId: string;
    description: string;
    odds: number;
    amount?: number;
  }): LiveRoom {
    // Only host/co-host can pin
    const user = room.participants.find(p => p.userId === userId);
    if (!user || (user.role !== "host" && user.role !== "co_host")) {
      return room;
    }

    return {
      ...room,
      pinnedBet: {
        userId,
        username,
        betId: bet.betId,
        description: bet.description,
        odds: bet.odds,
        amount: bet.amount,
        pinnedAt: Date.now(),
      },
    };
  }

  /**
   * Tail or fade a shared bet
   */
  tailOrFade(room: LiveRoom, sharedBetId: string, action: "tail" | "fade"): LiveRoom {
    return {
      ...room,
      sharedBets: room.sharedBets.map(bet =>
        bet.id === sharedBetId
          ? {
              ...bet,
              tails: action === "tail" ? bet.tails + 1 : bet.tails,
              fades: action === "fade" ? bet.fades + 1 : bet.fades,
            }
          : bet
      ),
    };
  }

  /**
   * Create a poll
   */
  createPoll(
    room: LiveRoom,
    createdBy: string,
    question: string,
    options: string[],
    durationMinutes: number = 5
  ): LiveRoom {
    // Only host/co-host/speaker can create polls
    const user = room.participants.find(p => p.userId === createdBy);
    if (!user || user.role === "listener" || user.role === "muted") {
      return room;
    }

    const poll: RoomPoll = {
      id: `poll_${Date.now()}`,
      question,
      options: options.map((text, idx) => ({
        id: `opt_${idx}`,
        text,
        votes: 0,
      })),
      createdBy,
      endsAt: Date.now() + (durationMinutes * 60 * 1000),
      isActive: true,
    };

    return {
      ...room,
      polls: [poll, ...room.polls],
    };
  }

  /**
   * Send reaction
   */
  sendReaction(room: LiveRoom, emoji: string): LiveRoom {
    const existing = room.reactions.find(r => r.emoji === emoji);

    if (existing) {
      return {
        ...room,
        reactions: room.reactions.map(r =>
          r.emoji === emoji ? { ...r, count: r.count + 1, lastTriggered: Date.now() } : r
        ),
        totalReactions: room.totalReactions + 1,
      };
    }

    return {
      ...room,
      reactions: [...room.reactions, { emoji, count: 1, lastTriggered: Date.now() }],
      totalReactions: room.totalReactions + 1,
    };
  }

  /**
   * Send tip to speaker
   */
  sendTip(
    room: LiveRoom,
    fromUserId: string,
    fromUsername: string,
    toUserId: string,
    amount: number,
    message?: string
  ): { room: LiveRoom; tip: RoomTip } {
    const tip: RoomTip = {
      id: `tip_${Date.now()}`,
      roomId: room.id,
      fromUserId,
      fromUsername,
      toUserId,
      toUsername: room.participants.find(p => p.userId === toUserId)?.username ?? "Unknown",
      amount,
      message,
      createdAt: Date.now(),
    };

    const updatedRoom: LiveRoom = {
      ...room,
      totalTips: room.totalTips + amount,
      participants: room.participants.map(p =>
        p.userId === toUserId ? { ...p, tipsReceived: p.tipsReceived + amount } : p
      ),
    };

    return { room: updatedRoom, tip };
  }

  /**
   * End room
   */
  endRoom(room: LiveRoom): LiveRoom {
    return {
      ...room,
      status: "ended",
      endedAt: Date.now(),
    };
  }

  /**
   * Get room suggestions for a game
   */
  suggestRoomsForGame(
    rooms: LiveRoom[],
    gameId: string,
    limit: number = 10
  ): LiveRoom[] {
    return rooms
      .filter(r => r.gameId === gameId && r.status === "live")
      .sort((a, b) => b.participants.length - a.participants.length)
      .slice(0, limit);
  }

  /**
   * Get trending rooms
   */
  getTrendingRooms(rooms: LiveRoom[], limit: number = 20): LiveRoom[] {
    return rooms
      .filter(r => r.status === "live" && r.type === "public")
      .sort((a, b) => {
        const scoreA = a.participants.length + (a.totalReactions * 0.1) + (a.betsShared * 2);
        const scoreB = b.participants.length + (b.totalReactions * 0.1) + (b.betsShared * 2);
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  /**
   * Generate invite code
   */
  generateInvite(room: LiveRoom, inviterId: string, maxUses?: number): RoomInvite {
    return {
      id: `invite_${Date.now()}`,
      roomId: room.id,
      inviterId,
      inviteCode: Math.random().toString(36).substring(2, 10).toUpperCase(),
      maxUses,
      uses: 0,
      expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      createdAt: Date.now(),
    };
  }
}

// ============================================================================
// ROOM REACTIONS
// ============================================================================

export const ROOM_REACTIONS = [
  { emoji: "🔥", name: "Fire", sound: "fire" },
  { emoji: "💰", name: "Money", sound: "cha-ching" },
  { emoji: "🎯", name: "Locked", sound: "lock" },
  { emoji: "👏", name: "Clap", sound: "applause" },
  { emoji: "😱", name: "Shocked", sound: "gasp" },
  { emoji: "🙏", name: "Pray", sound: "bell" },
  { emoji: "💀", name: "Dead", sound: "rip" },
  { emoji: "🚀", name: "Moon", sound: "rocket" },
];

// ============================================================================
// FACTORY
// ============================================================================

export function createLiveRoomsService(): LiveRoomsService {
  return new LiveRoomsService();
}
