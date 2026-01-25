/**
 * Audio Streaming Integration for Live Rooms
 * Handles WebRTC, audio processing, and streaming infrastructure
 */

import { z } from "zod";
import type {
  AudioConfig,
  AudioQuality,
  ParticipantRole,
  RoomParticipant,
} from "./types";

// ============================================================================
// TYPES
// ============================================================================

export interface AudioSession {
  id: string;
  roomId: string;
  userId: string;

  // Connection
  connectionState: "connecting" | "connected" | "disconnected" | "failed";
  iceConnectionState: "new" | "checking" | "connected" | "completed" | "failed" | "disconnected" | "closed";

  // Streams
  localStreamId?: string;
  remoteStreamIds: string[];

  // Audio state
  isPublishing: boolean;
  isSubscribed: boolean;
  isMuted: boolean;

  // Quality
  config: AudioConfig;
  currentBitrate: number;
  packetLoss: number;
  latency: number;

  // Stats
  bytesSent: number;
  bytesReceived: number;

  createdAt: number;
  lastActivityAt: number;
}

export interface AudioStreamStats {
  userId: string;
  streamId: string;

  // Quality metrics
  bitrate: number;
  packetLoss: number;
  jitter: number;
  latency: number;

  // Audio levels
  audioLevel: number; // 0-100
  peakLevel: number;

  // Network
  bytesSent: number;
  bytesReceived: number;
  packetsLost: number;

  timestamp: number;
}

export interface AudioServerConfig {
  provider: "livekit" | "agora" | "twilio" | "vonage" | "custom";
  serverUrl: string;
  apiKey: string;
  apiSecret: string;
  region: string;

  // Limits
  maxParticipantsPerRoom: number;
  maxSpeakersPerRoom: number;
  maxBitrate: number;

  // Features
  recordingEnabled: boolean;
  transcriptionEnabled: boolean;
  noiseSuppression: boolean;
}

export interface AudioToken {
  token: string;
  roomId: string;
  userId: string;
  role: ParticipantRole;
  expiresAt: number;
  permissions: AudioPermissions;
}

export interface AudioPermissions {
  canPublish: boolean;
  canSubscribe: boolean;
  canRecord: boolean;
  canModerate: boolean;
}

export interface RecordingSession {
  id: string;
  roomId: string;

  // Status
  status: "starting" | "recording" | "stopping" | "stopped" | "processing" | "completed" | "failed";

  // Config
  format: "mp3" | "wav" | "m4a" | "ogg";
  quality: AudioQuality;

  // Output
  outputUrl?: string;
  fileSize?: number;
  duration?: number;

  // Timestamps
  startedAt: number;
  stoppedAt?: number;
  completedAt?: number;

  error?: string;
}

// ============================================================================
// AUDIO STREAMING SERVICE
// ============================================================================

export class AudioStreamingService {
  private config: AudioServerConfig;
  private sessions: Map<string, AudioSession> = new Map();
  private recordings: Map<string, RecordingSession> = new Map();

  constructor(config: AudioServerConfig) {
    this.config = config;
  }

  /**
   * Generate token for audio room access
   */
  generateToken(
    roomId: string,
    userId: string,
    role: ParticipantRole,
    ttlSeconds: number = 3600
  ): AudioToken {
    const permissions = this.getPermissionsForRole(role);

    // In production, this would use the provider's SDK to generate a real token
    const token = this.createProviderToken(roomId, userId, permissions, ttlSeconds);

    return {
      token,
      roomId,
      userId,
      role,
      expiresAt: Date.now() + ttlSeconds * 1000,
      permissions,
    };
  }

  /**
   * Get permissions based on role
   */
  private getPermissionsForRole(role: ParticipantRole): AudioPermissions {
    switch (role) {
      case "host":
        return {
          canPublish: true,
          canSubscribe: true,
          canRecord: true,
          canModerate: true,
        };
      case "co_host":
        return {
          canPublish: true,
          canSubscribe: true,
          canRecord: true,
          canModerate: true,
        };
      case "speaker":
        return {
          canPublish: true,
          canSubscribe: true,
          canRecord: false,
          canModerate: false,
        };
      case "listener":
      case "muted":
      case "banned":
      default:
        return {
          canPublish: false,
          canSubscribe: true,
          canRecord: false,
          canModerate: false,
        };
    }
  }

  /**
   * Create provider-specific token
   */
  private createProviderToken(
    roomId: string,
    userId: string,
    permissions: AudioPermissions,
    ttlSeconds: number
  ): string {
    // This would be provider-specific implementation
    // For LiveKit, Agora, Twilio, etc.

    const payload = {
      roomId,
      userId,
      permissions,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
      iat: Math.floor(Date.now() / 1000),
    };

    // Simulate token generation - in production use actual SDK
    const tokenData = Buffer.from(JSON.stringify(payload)).toString("base64");
    return `${this.config.provider}_${tokenData}_${this.generateSignature(payload)}`;
  }

  /**
   * Generate signature for token
   */
  private generateSignature(payload: object): string {
    // In production, use actual HMAC signing
    const hash = JSON.stringify(payload)
      .split("")
      .reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
    return Math.abs(hash).toString(16).padStart(8, "0");
  }

  /**
   * Create audio session for participant
   */
  createSession(
    roomId: string,
    userId: string,
    config: AudioConfig
  ): AudioSession {
    const sessionId = `session_${roomId}_${userId}_${Date.now()}`;

    const session: AudioSession = {
      id: sessionId,
      roomId,
      userId,
      connectionState: "connecting",
      iceConnectionState: "new",
      remoteStreamIds: [],
      isPublishing: false,
      isSubscribed: false,
      isMuted: false,
      config,
      currentBitrate: 0,
      packetLoss: 0,
      latency: 0,
      bytesSent: 0,
      bytesReceived: 0,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Update session state
   */
  updateSession(
    sessionId: string,
    updates: Partial<AudioSession>
  ): AudioSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const updated = {
      ...session,
      ...updates,
      lastActivityAt: Date.now(),
    };

    this.sessions.set(sessionId, updated);
    return updated;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): AudioSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Get sessions for a room
   */
  getRoomSessions(roomId: string): AudioSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.roomId === roomId
    );
  }

  /**
   * End session
   */
  endSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.sessions.delete(sessionId);
    return true;
  }

  /**
   * Start recording for a room
   */
  startRecording(
    roomId: string,
    format: RecordingSession["format"] = "mp3",
    quality: AudioQuality = "high"
  ): RecordingSession {
    const recordingId = `rec_${roomId}_${Date.now()}`;

    const recording: RecordingSession = {
      id: recordingId,
      roomId,
      status: "starting",
      format,
      quality,
      startedAt: Date.now(),
    };

    this.recordings.set(recordingId, recording);

    // Simulate starting recording - in production, call provider API
    setTimeout(() => {
      const rec = this.recordings.get(recordingId);
      if (rec) {
        rec.status = "recording";
        this.recordings.set(recordingId, rec);
      }
    }, 1000);

    return recording;
  }

  /**
   * Stop recording
   */
  stopRecording(recordingId: string): RecordingSession | null {
    const recording = this.recordings.get(recordingId);
    if (!recording) return null;

    recording.status = "stopping";
    recording.stoppedAt = Date.now();

    // Simulate processing - in production, wait for provider callback
    setTimeout(() => {
      const rec = this.recordings.get(recordingId);
      if (rec) {
        rec.status = "processing";
        this.recordings.set(recordingId, rec);

        // Simulate completion
        setTimeout(() => {
          const r = this.recordings.get(recordingId);
          if (r) {
            r.status = "completed";
            r.completedAt = Date.now();
            r.duration = r.stoppedAt ? (r.stoppedAt - r.startedAt) / 1000 : 0;
            r.outputUrl = `https://storage.pull.app/recordings/${recordingId}.${r.format}`;
            r.fileSize = Math.floor(r.duration * 16000); // Rough estimate
            this.recordings.set(recordingId, r);
          }
        }, 5000);
      }
    }, 2000);

    this.recordings.set(recordingId, recording);
    return recording;
  }

  /**
   * Get recording by ID
   */
  getRecording(recordingId: string): RecordingSession | null {
    return this.recordings.get(recordingId) ?? null;
  }

  /**
   * Get recordings for a room
   */
  getRoomRecordings(roomId: string): RecordingSession[] {
    return Array.from(this.recordings.values()).filter(
      (r) => r.roomId === roomId
    );
  }

  /**
   * Get optimal audio config based on network conditions
   */
  getOptimalConfig(
    networkQuality: "excellent" | "good" | "fair" | "poor"
  ): AudioConfig {
    switch (networkQuality) {
      case "excellent":
        return {
          quality: "studio",
          sampleRate: 48000,
          bitrate: 256000,
          channels: 2,
          codec: "opus",
          noiseSuppressionEnabled: true,
          echoCancellationEnabled: true,
          autoGainControlEnabled: true,
        };
      case "good":
        return {
          quality: "high",
          sampleRate: 48000,
          bitrate: 128000,
          channels: 1,
          codec: "opus",
          noiseSuppressionEnabled: true,
          echoCancellationEnabled: true,
          autoGainControlEnabled: true,
        };
      case "fair":
        return {
          quality: "medium",
          sampleRate: 44100,
          bitrate: 64000,
          channels: 1,
          codec: "opus",
          noiseSuppressionEnabled: true,
          echoCancellationEnabled: true,
          autoGainControlEnabled: true,
        };
      case "poor":
      default:
        return {
          quality: "low",
          sampleRate: 22050,
          bitrate: 32000,
          channels: 1,
          codec: "opus",
          noiseSuppressionEnabled: true,
          echoCancellationEnabled: true,
          autoGainControlEnabled: true,
        };
    }
  }

  /**
   * Calculate audio level from raw samples
   */
  calculateAudioLevel(samples: Float32Array): number {
    if (samples.length === 0) return 0;

    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }

    const rms = Math.sqrt(sum / samples.length);
    const db = 20 * Math.log10(rms + 0.0001);

    // Normalize to 0-100 range
    const normalized = Math.max(0, Math.min(100, (db + 60) * (100 / 60)));
    return Math.round(normalized);
  }

  /**
   * Get server info
   */
  getServerInfo(): {
    provider: string;
    region: string;
    maxParticipants: number;
    maxSpeakers: number;
    features: string[];
  } {
    return {
      provider: this.config.provider,
      region: this.config.region,
      maxParticipants: this.config.maxParticipantsPerRoom,
      maxSpeakers: this.config.maxSpeakersPerRoom,
      features: [
        ...(this.config.recordingEnabled ? ["recording"] : []),
        ...(this.config.transcriptionEnabled ? ["transcription"] : []),
        ...(this.config.noiseSuppression ? ["noise_suppression"] : []),
      ],
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createAudioStreamingService(
  config?: Partial<AudioServerConfig>
): AudioStreamingService {
  const defaultConfig: AudioServerConfig = {
    provider: "livekit",
    serverUrl: process.env.AUDIO_SERVER_URL ?? "wss://audio.pull.app",
    apiKey: process.env.AUDIO_API_KEY ?? "",
    apiSecret: process.env.AUDIO_API_SECRET ?? "",
    region: "us-west-2",
    maxParticipantsPerRoom: 5000,
    maxSpeakersPerRoom: 20,
    maxBitrate: 256000,
    recordingEnabled: true,
    transcriptionEnabled: true,
    noiseSuppression: true,
  };

  return new AudioStreamingService({ ...defaultConfig, ...config });
}
