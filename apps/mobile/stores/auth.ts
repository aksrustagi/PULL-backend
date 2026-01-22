/**
 * Auth Store - Zustand
 */

import { create } from "zustand";
import { api } from "../services/api";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string) => {
    const { user } = await api.login(email, password);
    set({ user, isAuthenticated: true });
  },

  register: async (email: string, password: string, name: string) => {
    await api.register(email, password, name);
  },

  logout: async () => {
    await api.logout();
    set({ user: null, isAuthenticated: false });
  },

  setUser: (user: User | null) => {
    set({ user, isAuthenticated: !!user });
  },

  initialize: async () => {
    try {
      await api.init();
      // Try to fetch current user if token exists
      // For now just set loading to false
      set({ isLoading: false });
    } catch {
      set({ isLoading: false, user: null, isAuthenticated: false });
    }
  },
}));
