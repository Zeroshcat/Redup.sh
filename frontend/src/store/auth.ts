"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ServerUser } from "@/lib/api/auth";

interface AuthState {
  user: ServerUser | null;
  hydrated: boolean;
  setUser: (user: ServerUser | null) => void;
  clear: () => void;
  markHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      hydrated: false,
      setUser: (user) => set({ user }),
      clear: () => set({ user: null }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "redup-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);
