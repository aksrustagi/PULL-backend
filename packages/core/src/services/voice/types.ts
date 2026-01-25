/**
 * Voice-First Experience
 * Voice commands, audio recaps, and speech-to-text/text-to-speech integration
 */

export interface VoiceCommand {
  commandId: string;
  userId: string;
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  leagueId?: string;
  teamId?: string;
  rawTranscript: string;
  parsedIntent: VoiceIntent;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: unknown;
  createdAt: Date;
}

export interface VoiceIntent {
  action: 'set_lineup' | 'add_player' | 'drop_player' | 'trade' | 'query_stats' | 'get_recap' | 'other';
  entities: {
    playerNames?: string[];
    positions?: string[];
    teamName?: string;
    date?: string;
    [key: string]: unknown;
  };
  confidence: number; // 0-1
}

export interface AudioRecap {
  recapId: string;
  userId: string;
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  leagueId: string;
  recapType: 'daily' | 'weekly' | 'trade' | 'matchup';
  textContent: string;
  audioUrl?: string;
  duration?: number;
  voice: string; // ElevenLabs voice ID or OpenAI voice name
  createdAt: Date;
}

export interface VoiceCommandRequest {
  audioUrl?: string;
  audioBuffer?: ArrayBuffer;
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  leagueId?: string;
  teamId?: string;
}

export interface TextToSpeechRequest {
  text: string;
  voice?: string;
  speed?: number;
  format?: 'mp3' | 'wav' | 'opus';
}

export interface VoiceConfig {
  whisperApiKey?: string;
  elevenLabsApiKey?: string;
  openAiApiKey?: string;
  defaultVoice: string;
  maxAudioDuration: number;
}
