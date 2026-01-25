import type {
  UserPresence,
  CollaborationSession,
  PresenceHeartbeat,
  TypingIndicator,
  PresenceAlert,
  PresenceConfig,
} from './types';

/**
 * PresenceService - Manages real-time user presence and collaboration
 * Integrates with WebSocket channels and CRDT for offline-first editing
 */
export class PresenceService {
  private static instance: PresenceService;
  private config: PresenceConfig;

  private constructor(config: Partial<PresenceConfig> = {}) {
    this.config = {
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 5000,
      idleTimeoutMs: config.idleTimeoutMs ?? 60000,
      awayTimeoutMs: config.awayTimeoutMs ?? 300000,
      maxParticipantsPerRoom: config.maxParticipantsPerRoom ?? 100,
    };
  }

  static getInstance(config?: Partial<PresenceConfig>): PresenceService {
    if (!PresenceService.instance) {
      PresenceService.instance = new PresenceService(config);
    }
    return PresenceService.instance;
  }

  async sendHeartbeat(heartbeat: PresenceHeartbeat): Promise<void> {
    // TODO: Implement WebSocket heartbeat
    console.log('Sending heartbeat', heartbeat);
  }

  async getRoomPresence(roomId: string): Promise<UserPresence[]> {
    // TODO: Query active users in room
    return [];
  }

  async updateTypingStatus(indicator: TypingIndicator): Promise<void> {
    // TODO: Broadcast typing indicator
    console.log('Typing indicator', indicator);
  }

  async joinRoom(userId: string, roomId: string, roomType: UserPresence['roomType'], sport: UserPresence['sport']): Promise<void> {
    // TODO: Add user to room presence
    console.log('User joined room', { userId, roomId, roomType, sport });
  }

  async leaveRoom(userId: string, roomId: string): Promise<void> {
    // TODO: Remove user from room presence
    console.log('User left room', { userId, roomId });
  }

  async createCollaborationSession(roomId: string, participants: string[]): Promise<CollaborationSession> {
    // TODO: Initialize collaboration session with CRDT
    // Use a more portable UUID generation method
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    return {
      sessionId,
      roomId,
      participants,
      activeEditors: [],
      conflictResolutionStrategy: 'crdt',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async detectViewingConflict(roomId: string, targetElementId: string): Promise<PresenceAlert | null> {
    // TODO: Check if multiple users viewing same element (e.g., same player during waivers)
    return null;
  }
}

export const presenceService = PresenceService.getInstance();
