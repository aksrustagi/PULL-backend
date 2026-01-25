/**
 * Fantasy Markets Mobile - API Client
 */

import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import type { ApiResponse } from "../types";

const API_URL = Constants.expoConfig?.extra?.apiUrl || "http://localhost:3001";

class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async init(): Promise<void> {
    this.accessToken = await SecureStore.getItemAsync("accessToken");
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
    if (token) {
      SecureStore.setItemAsync("accessToken", token);
    } else {
      SecureStore.deleteItemAsync("accessToken");
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (this.accessToken) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.error?.message || "An error occurred",
        data.error?.code || "UNKNOWN_ERROR",
        response.status
      );
    }

    return data as ApiResponse<T>;
  }

  // ==========================================================================
  // AUTH
  // ==========================================================================

  async login(email: string, password: string): Promise<{ accessToken: string; user: any }> {
    const response = await this.request<{ accessToken: string; refreshToken: string; user: any }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }
    );
    if (response.data?.accessToken) {
      this.setAccessToken(response.data.accessToken);
    }
    return response.data!;
  }

  async register(email: string, password: string, name: string): Promise<{ user: any }> {
    const response = await this.request<{ user: any }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName: name }),
    });
    return response.data!;
  }

  async logout(): Promise<void> {
    this.setAccessToken(null);
  }

  // ==========================================================================
  // LEAGUES
  // ==========================================================================

  async getLeagues() {
    return this.request<any[]>("/api/v1/fantasy/leagues");
  }

  async getLeague(leagueId: string) {
    return this.request<any>(`/api/v1/fantasy/leagues/${leagueId}`);
  }

  async createLeague(data: any) {
    return this.request<any>("/api/v1/fantasy/leagues", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async joinLeague(inviteCode: string, teamName: string) {
    return this.request<any>("/api/v1/fantasy/leagues/join", {
      method: "POST",
      body: JSON.stringify({ inviteCode, teamName }),
    });
  }

  async getLeagueStandings(leagueId: string) {
    return this.request<any>(`/api/v1/fantasy/leagues/${leagueId}/standings`);
  }

  async getLeagueSchedule(leagueId: string, week?: number) {
    const params = week ? `?week=${week}` : "";
    return this.request<any>(`/api/v1/fantasy/leagues/${leagueId}/schedule${params}`);
  }

  // ==========================================================================
  // TEAMS
  // ==========================================================================

  async getTeam(teamId: string) {
    return this.request<any>(`/api/v1/fantasy/teams/${teamId}`);
  }

  async getRoster(teamId: string, week?: number) {
    const params = week ? `?week=${week}` : "";
    return this.request<any>(`/api/v1/fantasy/teams/${teamId}/roster${params}`);
  }

  async setLineup(teamId: string, moves: any[]) {
    return this.request<any>(`/api/v1/fantasy/teams/${teamId}/roster`, {
      method: "PUT",
      body: JSON.stringify({ moves }),
    });
  }

  async getMatchup(teamId: string) {
    return this.request<any>(`/api/v1/fantasy/teams/${teamId}/matchup`);
  }

  async getOptimizedLineup(teamId: string) {
    return this.request<any>(`/api/v1/fantasy/teams/${teamId}/optimize`);
  }

  // ==========================================================================
  // PLAYERS
  // ==========================================================================

  async searchPlayers(params: {
    query?: string;
    position?: string;
    status?: string;
    leagueId?: string;
    limit?: number;
    offset?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params.query) searchParams.append("query", params.query);
    if (params.position) searchParams.append("position", params.position);
    if (params.status) searchParams.append("status", params.status);
    if (params.leagueId) searchParams.append("leagueId", params.leagueId);
    if (params.limit) searchParams.append("limit", params.limit.toString());
    if (params.offset) searchParams.append("offset", params.offset.toString());

    return this.request<any[]>(`/api/v1/fantasy/players?${searchParams.toString()}`);
  }

  async getPlayer(playerId: string) {
    return this.request<any>(`/api/v1/fantasy/players/${playerId}`);
  }

  async getPlayerStats(playerId: string, week?: number) {
    const params = week ? `?week=${week}` : "";
    return this.request<any>(`/api/v1/fantasy/players/${playerId}/stats${params}`);
  }

  async getPlayerProjections(playerId: string) {
    return this.request<any>(`/api/v1/fantasy/players/${playerId}/projections`);
  }

  async getNFLGames(week?: number) {
    const params = week ? `?week=${week}` : "";
    return this.request<any[]>(`/api/v1/fantasy/players/nfl/games${params}`);
  }

  // ==========================================================================
  // TRANSACTIONS
  // ==========================================================================

  async addPlayer(leagueId: string, teamId: string, playerId: string, dropPlayerId?: string) {
    return this.request<any>("/api/v1/fantasy/transactions/add", {
      method: "POST",
      body: JSON.stringify({ leagueId, teamId, addPlayerId: playerId, dropPlayerId }),
    });
  }

  async dropPlayer(leagueId: string, teamId: string, playerId: string) {
    return this.request<any>("/api/v1/fantasy/transactions/drop", {
      method: "POST",
      body: JSON.stringify({ leagueId, teamId, dropPlayerId: playerId }),
    });
  }

  async submitWaiverClaim(data: any) {
    return this.request<any>("/api/v1/fantasy/transactions/waiver", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async proposeTrade(data: any) {
    return this.request<any>("/api/v1/fantasy/transactions/trade", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async respondToTrade(tradeId: string, accept: boolean, message?: string) {
    return this.request<any>(`/api/v1/fantasy/transactions/trade/${tradeId}/respond`, {
      method: "PUT",
      body: JSON.stringify({ accept, message }),
    });
  }

  async getTransactions(leagueId: string, params?: { type?: string; limit?: number }) {
    const searchParams = new URLSearchParams({ leagueId });
    if (params?.type) searchParams.append("type", params.type);
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    return this.request<any[]>(`/api/v1/fantasy/transactions?${searchParams.toString()}`);
  }

  // ==========================================================================
  // MARKETS
  // ==========================================================================

  async getMarkets(params?: {
    type?: string;
    status?: string;
    leagueId?: string;
    week?: number;
    limit?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.append("type", params.type);
    if (params?.status) searchParams.append("status", params.status);
    if (params?.leagueId) searchParams.append("leagueId", params.leagueId);
    if (params?.week) searchParams.append("week", params.week.toString());
    if (params?.limit) searchParams.append("limit", params.limit.toString());

    return this.request<any[]>(`/api/v1/fantasy/markets?${searchParams.toString()}`);
  }

  async getMarket(marketId: string, oddsFormat?: string) {
    const params = oddsFormat ? `?oddsFormat=${oddsFormat}` : "";
    return this.request<any>(`/api/v1/fantasy/markets/${marketId}${params}`);
  }

  async placeBet(marketId: string, outcomeId: string, amount: number) {
    return this.request<any>(`/api/v1/fantasy/markets/${marketId}/bet`, {
      method: "POST",
      body: JSON.stringify({ outcomeId, amount }),
    });
  }

  async getMyBets(params?: { status?: string; leagueId?: string; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append("status", params.status);
    if (params?.leagueId) searchParams.append("leagueId", params.leagueId);
    if (params?.limit) searchParams.append("limit", params.limit.toString());

    return this.request<any>(`/api/v1/fantasy/markets/bets/mine?${searchParams.toString()}`);
  }

  async getActiveBets() {
    return this.request<any>("/api/v1/fantasy/markets/bets/active");
  }

  async cashOut(betId: string) {
    return this.request<any>(`/api/v1/fantasy/markets/bets/${betId}/cashout`, {
      method: "POST",
    });
  }
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export const api = new ApiClient(API_URL);
