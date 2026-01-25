/**
 * Second Screen Experience
 * Watch apps, TV apps, widgets, and multi-device sync
 */

export interface WatchComplication {
  complicationId: string;
  userId: string;
  type: 'score' | 'player_stat' | 'rank' | 'alert';
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  data: unknown;
  lastUpdated: Date;
}

export interface HomeScreenWidget {
  widgetId: string;
  userId: string;
  widgetType: 'lineup' | 'matchup' | 'player_alert' | 'league_standings';
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  size: 'small' | 'medium' | 'large';
  refreshIntervalMinutes: number;
  data: unknown;
}

export interface TVDashboard {
  userId: string;
  sport: 'nfl' | 'nba' | 'mlb' | 'golf' | 'ncaa';
  layout: 'single_league' | 'multi_league' | 'player_focus';
  widgets: TVWidget[];
  theme: 'light' | 'dark';
}

export interface TVWidget {
  widgetId: string;
  type: 'live_scores' | 'matchup' | 'standings' | 'player_stats' | 'news';
  position: { x: number; y: number; width: number; height: number };
  config: Record<string, unknown>;
}

export interface CarPlayUpdate {
  updateId: string;
  userId: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  audioUrl?: string;
  timestamp: Date;
}

export interface SecondScreenConfig {
  watchEnabled: boolean;
  tvEnabled: boolean;
  carPlayEnabled: boolean;
  widgetRefreshIntervalMinutes: number;
}
