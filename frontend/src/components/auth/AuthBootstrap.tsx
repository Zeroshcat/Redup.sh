"use client";

import { useEffect } from "react";
import { me } from "@/lib/api/auth";
import { getAccessToken, clearTokens, APIError } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

/**
 * Runs once on mount: if we have a stored access token, fetch /users/me to
 * verify it's still valid and rehydrate the store. Mounted in the main layout
 * so every logged-in page gets consistent session state.
 */
export function AuthBootstrap() {
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      clear();
      return;
    }
    me()
      .then((u) => setUser(u))
      .catch((err) => {
        if (err instanceof APIError && err.status === 401) {
          clearTokens();
          clear();
        }
      });
  }, [setUser, clear]);

  return null;
}
