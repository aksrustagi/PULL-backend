/**
 * Live Rooms Service
 * Create, join, and manage Clubhouse-style audio rooms
 */

import type {
  LiveRoom,
  RoomSettings,
  RoomParticipant,
  RoomType,
  RoomStatus,
  ParticipantRole,
  RoomTip,
  TipLeaderboard,
  RoomRecording,
  ScheduledRoom,
  RoomChatMessage,
  RoomModerationAction,
  RoomEvent,
  CreateRoomRequest,
  JoinRoomRequest,
  UpdateRoomRequest,
  SendTipRequest,
  RoomSearchFilters,
  RoomListResponse,
  AudioConfig,
} from "./types";
import { AudioStreamingService, createAudioStreamingService } from "./audio";

// ============================================================================
// LIVE ROOMS SERVICE
// ============================================================================

export class LiveRoomsService {
  private rooms: Map<string, LiveRoom> = new Map();
  private scheduledRooms: Map<string, ScheduledRoom> = new Map();
  private recordings: Map<string, RoomRecording> = new Map();
  private tips: Map<string, RoomTip[]> = new Map();
  private chatMessages: Map<string, RoomChatMessage[]> = new Map();
  private audioService: AudioStreamingService;

  constructor(audioService?: AudioStreamingService) {
    this.audioService = audioService ?? createAudioStreamingService();
  }

  // ==========================================================================
  // ROOM LIFECYCLE
  // ==========================================================================

  /**
   * Create a new live room
   */
  async createRoom(
    hostId: string,
    hostUsername: string,
    request: CreateRoomRequest
  ): Promise<LiveRoom> {
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const defaultSettings: RoomSettings = {
      maxParticipants: 5000,
      maxSpeakers: 10,
      allowRaiseHand: true,
      allowChat: true,
      allowReactions: true,
      allowTips: true,
      allowRecording: true,
      requireApproval: false,
      blockedWords: [],
    };

    const room: LiveRoom = {
      id: roomId,
      title: request.title,
      description: request.description ?? "",
      type: request.type,
      status: request.scheduledStartTime ? "scheduled" : "starting",
      hostId,
      hostUsername,
      coHostIds: [],
      eventId: request.eventId,
      settings: { ...defaultSettings, ...request.settings },
      participants: [],
      speakerIds: [hostId],
      listenerCount: 0,
      peakListenerCount: 0,
      audioConfig: this.audioService.getOptimalConfig("good"),
      isRecording: false,
      tipsEnabled: request.settings?.allowTips ?? true,
      totalTips: 0,
      tipCount: 0,
      scheduledStartTime: request.scheduledStartTime,
      tags: request.tags ?? [],
      isPublic: request.isPublic ?? true,
      isFeatured: false,
      reactions: {
        fire: 0,
        clap: 0,
        love: 0,
        laugh: 0,
        wow: 0,
        thinking: 0,
        money: 0,
        trophy: 0,
      },
      chatEnabled: request.settings?.allowChat ?? true,
      chatMessageCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Add host as first participant
    const hostParticipant: RoomParticipant = {
      id: `participant_${hostId}`,
      userId: hostId,
      username: hostUsername,
      displayName: hostUsername,
      role: "host",
      isSpeaking: false,
      isMuted: false,
      hasRaisedHand: false,
      audioLevel: 0,
      isSelfMuted: false,
      reactionCount: 0,
      chatMessageCount: 0,
      tipsGiven: 0,
      tipsReceived: 0,
      isVerified: false,
      isVIP: false,
      badges: ["host"],
      joinedAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    room.participants.push(hostParticipant);
    this.rooms.set(roomId, room);
    this.tips.set(roomId, []);
    this.chatMessages.set(roomId, []);

    return room;
  }

  /**
   * Start a room (transition from scheduled/starting to live)
   */
  async startRoom(roomId: string, userId: string): Promise<LiveRoom> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");
    if (room.hostId !== userId && !room.coHostIds.includes(userId)) {
      throw new Error("Only host or co-hosts can start the room");
    }

    room.status = "live";
    room.actualStartTime = Date.now();
    room.updatedAt = Date.now();

    this.rooms.set(roomId, room);
    this.emitEvent(roomId, "room_started", { startedBy: userId });

    return room;
  }

  /**
   * End a room
   */
  async endRoom(roomId: string, userId: string): Promise<LiveRoom> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");
    if (room.hostId !== userId && !room.coHostIds.includes(userId)) {
      throw new Error("Only host or co-hosts can end the room");
    }

    room.status = "ended";
    room.endTime = Date.now();
    room.duration = room.actualStartTime
      ? Math.floor((room.endTime - room.actualStartTime) / 1000)
      : 0;
    room.updatedAt = Date.now();

    // Stop recording if active
    if (room.isRecording) {
      await this.stopRecording(roomId, userId);
    }

    this.rooms.set(roomId, room);
    this.emitEvent(roomId, "room_ended", { endedBy: userId });

    return room;
  }

  /**
   * Pause a room
   */
  async pauseRoom(roomId: string, userId: string): Promise<LiveRoom> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");
    if (room.hostId !== userId && !room.coHostIds.includes(userId)) {
      throw new Error("Only host or co-hosts can pause the room");
    }

    room.status = "paused";
    room.updatedAt = Date.now();

    this.rooms.set(roomId, room);
    this.emitEvent(roomId, "room_paused", { pausedBy: userId });

    return room;
  }

  // ==========================================================================
  // PARTICIPANTS
  // ==========================================================================

  /**
   * Join a room
   */
  async joinRoom(
    request: JoinRoomRequest,
    userId: string,
    username: string,
    options?: {
      avatarUrl?: string;
      isVerified?: boolean;
      isVIP?: boolean;
    }
  ): Promise<{ room: LiveRoom; participant: RoomParticipant; audioToken: string }> {
    const room = this.rooms.get(request.roomId);
    if (!room) throw new Error("Room not found");

    if (room.status === "ended" || room.status === "cancelled") {
      throw new Error("Room is no longer active");
    }

    // Check if already in room
    const existingParticipant = room.participants.find((p) => p.userId === userId);
    if (existingParticipant) {
      const token = this.audioService.generateToken(
        request.roomId,
        userId,
        existingParticipant.role
      );
      return { room, participant: existingParticipant, audioToken: token.token };
    }

    // Check room capacity
    if (room.participants.length >= room.settings.maxParticipants) {
      throw new Error("Room is at capacity");
    }

    // Determine role
    let role: ParticipantRole = "listener";
    if (request.requestSpeaker && room.speakerIds.length < room.settings.maxSpeakers) {
      if (room.settings.requireApproval) {
        // Will need to raise hand
        role = "listener";
      } else {
        role = "speaker";
        room.speakerIds.push(userId);
      }
    }

    const participant: RoomParticipant = {
      id: `participant_${userId}_${Date.now()}`,
      userId,
      username,
      displayName: username,
      avatarUrl: options?.avatarUrl,
      role,
      isSpeaking: false,
      isMuted: false,
      hasRaisedHand: request.requestSpeaker && room.settings.requireApproval,
      raisedHandAt: request.requestSpeaker && room.settings.requireApproval ? Date.now() : undefined,
      audioLevel: 0,
      isSelfMuted: false,
      reactionCount: 0,
      chatMessageCount: 0,
      tipsGiven: 0,
      tipsReceived: 0,
      isVerified: options?.isVerified ?? false,
      isVIP: options?.isVIP ?? false,
      badges: [],
      joinedAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    room.participants.push(participant);
    room.listenerCount = room.participants.filter((p) => p.role === "listener").length;
    room.peakListenerCount = Math.max(room.peakListenerCount, room.participants.length);
    room.updatedAt = Date.now();

    this.rooms.set(request.roomId, room);
    this.emitEvent(request.roomId, "participant_joined", { userId, username, role });

    const token = this.audioService.generateToken(request.roomId, userId, role);

    return { room, participant, audioToken: token.token };
  }

  /**
   * Leave a room
   */
  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");

    const participantIndex = room.participants.findIndex((p) => p.userId === userId);
    if (participantIndex === -1) return;

    const participant = room.participants[participantIndex];
    room.participants.splice(participantIndex, 1);

    // Remove from speakers if applicable
    const speakerIndex = room.speakerIds.indexOf(userId);
    if (speakerIndex !== -1) {
      room.speakerIds.splice(speakerIndex, 1);
    }

    // Update counts
    room.listenerCount = room.participants.filter((p) => p.role === "listener").length;
    room.updatedAt = Date.now();

    // If host leaves, end room or transfer
    if (room.hostId === userId) {
      if (room.coHostIds.length > 0) {
        room.hostId = room.coHostIds[0];
        room.coHostIds.shift();
      } else {
        room.status = "ended";
        room.endTime = Date.now();
      }
    }

    this.rooms.set(roomId, room);
    this.emitEvent(roomId, "participant_left", { userId, username: participant.username });
  }

  /**
   * Raise hand to speak
   */
  async raiseHand(roomId: string, userId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");

    const participant = room.participants.find((p) => p.userId === userId);
    if (!participant) throw new Error("Not in room");

    if (!room.settings.allowRaiseHand) {
      throw new Error("Raise hand is disabled for this room");
    }

    participant.hasRaisedHand = true;
    participant.raisedHandAt = Date.now();
    participant.lastActiveAt = Date.now();
    room.updatedAt = Date.now();

    this.rooms.set(roomId, room);
    this.emitEvent(roomId, "hand_raised", { userId, username: participant.username });
  }

  /**
   * Lower hand
   */
  async lowerHand(roomId: string, userId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");

    const participant = room.participants.find((p) => p.userId === userId);
    if (!participant) throw new Error("Not in room");

    participant.hasRaisedHand = false;
    participant.raisedHandAt = undefined;
    participant.lastActiveAt = Date.now();
    room.updatedAt = Date.now();

    this.rooms.set(roomId, room);
    this.emitEvent(roomId, "hand_lowered", { userId, username: participant.username });
  }

  /**
   * Promote participant to speaker
   */
  async promoteSpeaker(
    roomId: string,
    moderatorId: string,
    targetUserId: string
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");

    // Check moderator permissions
    if (room.hostId !== moderatorId && !room.coHostIds.includes(moderatorId)) {
      throw new Error("Only host or co-hosts can promote speakers");
    }

    // Check speaker capacity
    if (room.speakerIds.length >= room.settings.maxSpeakers) {
      throw new Error("Maximum speakers reached");
    }

    const participant = room.participants.find((p) => p.userId === targetUserId);
    if (!participant) throw new Error("Participant not found");

    participant.role = "speaker";
    participant.hasRaisedHand = false;
    participant.raisedHandAt = undefined;
    participant.lastActiveAt = Date.now();
    room.speakerIds.push(targetUserId);
    room.updatedAt = Date.now();

    this.rooms.set(roomId, room);
    this.emitEvent(roomId, "speaker_added", {
      userId: targetUserId,
      username: participant.username,
      promotedBy: moderatorId,
    });
  }

  /**
   * Demote speaker to listener
   */
  async demoteSpeaker(
    roomId: string,
    moderatorId: string,
    targetUserId: string
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");

    // Check moderator permissions
    if (room.hostId !== moderatorId && !room.coHostIds.includes(moderatorId)) {
      throw new Error("Only host or co-hosts can demote speakers");
    }

    // Can't demote the host
    if (targetUserId === room.hostId) {
      throw new Error("Cannot demote the host");
    }

    const participant = room.participants.find((p) => p.userId === targetUserId);
    if (!participant) throw new Error("Participant not found");

    participant.role = "listener";
    participant.isSpeaking = false;
    participant.lastActiveAt = Date.now();

    const speakerIndex = room.speakerIds.indexOf(targetUserId);
    if (speakerIndex !== -1) {
      room.speakerIds.splice(speakerIndex, 1);
    }

    room.listenerCount = room.participants.filter((p) => p.role === "listener").length;
    room.updatedAt = Date.now();

    this.rooms.set(roomId, room);
    this.emitEvent(roomId, "speaker_removed", {
      userId: targetUserId,
      username: participant.username,
      demotedBy: moderatorId,
    });
  }

  // ==========================================================================
  // TIPS
  // ==========================================================================

  /**
   * Send a tip to a speaker
   */
  async sendTip(request: SendTipRequest, senderId: string, senderUsername: string): Promise<RoomTip> {
    const room = this.rooms.get(request.roomId);
    if (!room) throw new Error("Room not found");

    if (!room.tipsEnabled || !room.settings.allowTips) {
      throw new Error("Tips are disabled for this room");
    }

    const recipient = room.participants.find((p) => p.userId === request.recipientId);
    if (!recipient) throw new Error("Recipient not found");

    // In production, process payment here

    const tip: RoomTip = {
      id: `tip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      roomId: request.roomId,
      senderId,
      senderUsername,
      recipientId: request.recipientId,
      recipientUsername: recipient.username,
      amount: request.amount,
      currency: request.currency,
      message: request.message,
      animation: request.animation,
      isHighlighted: request.amount >= 10,
      createdAt: Date.now(),
    };

    // Update room stats
    room.totalTips += request.amount;
    room.tipCount += 1;
    room.updatedAt = Date.now();

    // Update participant stats
    const sender = room.participants.find((p) => p.userId === senderId);
    if (sender) {
      sender.tipsGiven += request.amount;
      sender.lastActiveAt = Date.now();
    }
    recipient.tipsReceived += request.amount;
    recipient.lastActiveAt = Date.now();

    // Store tip
    const roomTips = this.tips.get(request.roomId) ?? [];
    roomTips.push(tip);
    this.tips.set(request.roomId, roomTips);

    this.rooms.set(request.roomId, room);
    this.emitEvent(request.roomId, "tip_received", {
      tipId: tip.id,
      senderId,
      recipientId: request.recipientId,
      amount: request.amount,
    });

    return tip;
  }

  /**
   * Get tip leaderboard for a room
   */
  getTipLeaderboard(roomId: string): TipLeaderboard {
    const roomTips = this.tips.get(roomId) ?? [];

    // Aggregate by sender
    const tipperMap = new Map<string, { userId: string; username: string; total: number; count: number }>();
    const recipientMap = new Map<string, { userId: string; username: string; total: number; count: number }>();

    for (const tip of roomTips) {
      // Tippers
      const tipper = tipperMap.get(tip.senderId) ?? {
        userId: tip.senderId,
        username: tip.senderUsername,
        total: 0,
        count: 0,
      };
      tipper.total += tip.amount;
      tipper.count += 1;
      tipperMap.set(tip.senderId, tipper);

      // Recipients
      const recipient = recipientMap.get(tip.recipientId) ?? {
        userId: tip.recipientId,
        username: tip.recipientUsername,
        total: 0,
        count: 0,
      };
      recipient.total += tip.amount;
      recipient.count += 1;
      recipientMap.set(tip.recipientId, recipient);
    }

    return {
      roomId,
      topTippers: Array.from(tipperMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
        .map((t) => ({
          userId: t.userId,
          username: t.username,
          totalTipped: t.total,
          tipCount: t.count,
        })),
      topRecipients: Array.from(recipientMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
        .map((r) => ({
          userId: r.userId,
          username: r.username,
          totalReceived: r.total,
          tipCount: r.count,
        })),
      updatedAt: Date.now(),
    };
  }

  // ==========================================================================
  // RECORDING
  // ==========================================================================

  /**
   * Start recording a room
   */
  async startRecording(roomId: string, userId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");

    if (room.hostId !== userId && !room.coHostIds.includes(userId)) {
      throw new Error("Only host or co-hosts can start recording");
    }

    if (!room.settings.allowRecording) {
      throw new Error("Recording is disabled for this room");
    }

    if (room.isRecording) {
      throw new Error("Already recording");
    }

    const recording = this.audioService.startRecording(roomId, "mp3", "high");

    room.isRecording = true;
    room.updatedAt = Date.now();
    this.rooms.set(roomId, room);
    this.emitEvent(roomId, "recording_started", { startedBy: userId });
  }

  /**
   * Stop recording a room
   */
  async stopRecording(roomId: string, userId: string): Promise<RoomRecording | null> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");

    if (room.hostId !== userId && !room.coHostIds.includes(userId)) {
      throw new Error("Only host or co-hosts can stop recording");
    }

    if (!room.isRecording) {
      return null;
    }

    const recordings = this.audioService.getRoomRecordings(roomId);
    const activeRecording = recordings.find((r) => r.status === "recording");

    if (activeRecording) {
      this.audioService.stopRecording(activeRecording.id);
    }

    room.isRecording = false;
    room.updatedAt = Date.now();
    this.rooms.set(roomId, room);
    this.emitEvent(roomId, "recording_stopped", { stoppedBy: userId });

    // Create recording record
    if (activeRecording) {
      const roomRecording: RoomRecording = {
        id: activeRecording.id,
        roomId,
        title: room.title,
        description: room.description,
        duration: activeRecording.duration ?? 0,
        audioUrl: activeRecording.outputUrl ?? "",
        status: "processing",
        playCount: 0,
        likeCount: 0,
        shareCount: 0,
        chapters: [],
        highlights: [],
        createdAt: Date.now(),
      };
      this.recordings.set(activeRecording.id, roomRecording);
      return roomRecording;
    }

    return null;
  }

  /**
   * Get recordings for a room
   */
  getRoomRecordings(roomId: string): RoomRecording[] {
    return Array.from(this.recordings.values()).filter((r) => r.roomId === roomId);
  }

  // ==========================================================================
  // DISCOVERY
  // ==========================================================================

  /**
   * Get room by ID
   */
  getRoom(roomId: string): LiveRoom | null {
    return this.rooms.get(roomId) ?? null;
  }

  /**
   * Search/list rooms
   */
  searchRooms(
    filters: RoomSearchFilters,
    limit: number = 20,
    cursor?: string
  ): RoomListResponse {
    let rooms = Array.from(this.rooms.values());

    // Apply filters
    if (filters.type) {
      rooms = rooms.filter((r) => r.type === filters.type);
    }
    if (filters.status) {
      rooms = rooms.filter((r) => r.status === filters.status);
    }
    if (filters.sport) {
      rooms = rooms.filter((r) => r.sport === filters.sport);
    }
    if (filters.eventId) {
      rooms = rooms.filter((r) => r.eventId === filters.eventId);
    }
    if (filters.hostId) {
      rooms = rooms.filter((r) => r.hostId === filters.hostId);
    }
    if (filters.isPublic !== undefined) {
      rooms = rooms.filter((r) => r.isPublic === filters.isPublic);
    }
    if (filters.isFeatured !== undefined) {
      rooms = rooms.filter((r) => r.isFeatured === filters.isFeatured);
    }
    if (filters.tags && filters.tags.length > 0) {
      rooms = rooms.filter((r) =>
        filters.tags!.some((tag) => r.tags.includes(tag))
      );
    }
    if (filters.minListeners !== undefined) {
      rooms = rooms.filter((r) => r.participants.length >= filters.minListeners!);
    }

    // Sort by listener count (most popular first)
    rooms.sort((a, b) => b.participants.length - a.participants.length);

    // Pagination
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const paginatedRooms = rooms.slice(startIndex, startIndex + limit);

    return {
      rooms: paginatedRooms,
      total: rooms.length,
      hasMore: startIndex + limit < rooms.length,
      cursor: startIndex + limit < rooms.length ? String(startIndex + limit) : undefined,
    };
  }

  /**
   * Get live rooms for an event
   */
  getRoomsForEvent(eventId: string): LiveRoom[] {
    return Array.from(this.rooms.values()).filter(
      (r) => r.eventId === eventId && r.status === "live"
    );
  }

  /**
   * Get featured rooms
   */
  getFeaturedRooms(limit: number = 10): LiveRoom[] {
    return Array.from(this.rooms.values())
      .filter((r) => r.isFeatured && r.status === "live")
      .sort((a, b) => b.participants.length - a.participants.length)
      .slice(0, limit);
  }

  /**
   * Get trending rooms
   */
  getTrendingRooms(limit: number = 10): LiveRoom[] {
    return Array.from(this.rooms.values())
      .filter((r) => r.status === "live" && r.isPublic)
      .sort((a, b) => {
        // Score based on listeners, tips, and reactions
        const scoreA = a.participants.length + a.totalTips * 0.5 +
          Object.values(a.reactions).reduce((sum, v) => sum + v, 0) * 0.1;
        const scoreB = b.participants.length + b.totalTips * 0.5 +
          Object.values(b.reactions).reduce((sum, v) => sum + v, 0) * 0.1;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  // ==========================================================================
  // REACTIONS
  // ==========================================================================

  /**
   * Send a reaction
   */
  async sendReaction(
    roomId: string,
    userId: string,
    reaction: keyof LiveRoom["reactions"]
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");

    if (!room.settings.allowReactions) {
      throw new Error("Reactions are disabled for this room");
    }

    room.reactions[reaction] += 1;

    const participant = room.participants.find((p) => p.userId === userId);
    if (participant) {
      participant.reactionCount += 1;
      participant.lastActiveAt = Date.now();
    }

    room.updatedAt = Date.now();
    this.rooms.set(roomId, room);
    this.emitEvent(roomId, "reaction_sent", { userId, reaction });
  }

  // ==========================================================================
  // CHAT
  // ==========================================================================

  /**
   * Send chat message
   */
  async sendChatMessage(
    roomId: string,
    userId: string,
    content: string,
    type: RoomChatMessage["type"] = "text"
  ): Promise<RoomChatMessage> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");

    if (!room.chatEnabled || !room.settings.allowChat) {
      throw new Error("Chat is disabled for this room");
    }

    const participant = room.participants.find((p) => p.userId === userId);
    if (!participant) throw new Error("Not in room");

    const message: RoomChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      roomId,
      senderId: userId,
      senderUsername: participant.username,
      senderAvatarUrl: participant.avatarUrl,
      senderRole: participant.role,
      type,
      content,
      reactions: {},
      isPinned: false,
      isHighlighted: false,
      isDeleted: false,
      createdAt: Date.now(),
    };

    const messages = this.chatMessages.get(roomId) ?? [];
    messages.push(message);
    this.chatMessages.set(roomId, messages);

    room.chatMessageCount += 1;
    participant.chatMessageCount += 1;
    participant.lastActiveAt = Date.now();
    room.updatedAt = Date.now();

    this.rooms.set(roomId, room);
    this.emitEvent(roomId, "chat_message", { messageId: message.id, userId });

    return message;
  }

  /**
   * Get chat messages
   */
  getChatMessages(
    roomId: string,
    limit: number = 50,
    beforeId?: string
  ): RoomChatMessage[] {
    const messages = this.chatMessages.get(roomId) ?? [];

    let filtered = messages.filter((m) => !m.isDeleted);

    if (beforeId) {
      const index = filtered.findIndex((m) => m.id === beforeId);
      if (index !== -1) {
        filtered = filtered.slice(0, index);
      }
    }

    return filtered.slice(-limit);
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Emit room event
   */
  private emitEvent(roomId: string, type: RoomEvent["type"], data: Record<string, unknown>): void {
    // In production, emit to WebSocket/PubSub
    const event: RoomEvent = {
      type,
      roomId,
      timestamp: Date.now(),
      data,
    };
    console.log(`[LiveRoom Event] ${type}:`, event);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createLiveRoomsService(
  audioService?: AudioStreamingService
): LiveRoomsService {
  return new LiveRoomsService(audioService);
}
