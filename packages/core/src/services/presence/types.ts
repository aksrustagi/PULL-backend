/**
 * Real-Time Presence & Collaboration System
 * Enables live collaboration cursors, typing indicators, and user presence tracking
 */

export interface UserPresence {
  userId: string;
  roomId: string;
  roomType: 'roster' | 'trade' | 'waiver' | 'draft' | 'lineup';
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  status: 'active' | 'idle' | 'away';
  cursor?: {
    x: number;
    y: number;
    elementId?: string;
  };
  lastHeartbeat: Date;
  metadata?: Record<string, unknown>;
}

export interface CollaborationSession {
  sessionId: string;
  roomId: string;
  participants: string[];
  activeEditors: string[];
  conflictResolutionStrategy: 'last-write-wins' | 'crdt';
  createdAt: Date;
  updatedAt: Date;
}

export interface PresenceHeartbeat {
  userId: string;
  roomId: string;
  cursor?: UserPresence['cursor'];
  status: UserPresence['status'];
}

export interface TypingIndicator {
  userId: string;
  roomId: string;
  isTyping: boolean;
  context?: string;
}

export interface PresenceAlert {
  type: 'user_viewing' | 'user_editing' | 'user_left' | 'conflict_detected';
  userId: string;
  roomId: string;
  message: string;
  timestamp: Date;
}

export interface PresenceConfig {
  heartbeatIntervalMs: number;
  idleTimeoutMs: number;
  awayTimeoutMs: number;
  maxParticipantsPerRoom: number;
}
