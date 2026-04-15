import { api, setTokens, clearTokens } from "@/lib/api-client";

export interface ServerUser {
  id: number;
  username: string;
  email: string;
  avatar_url?: string;
  bio?: string;
  location?: string;
  website?: string;
  credit_score: number;
  level: number;
  role: string;
  status: string;
  joined_at: string;
}

export interface AuthSession {
  user: ServerUser;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export async function register(input: {
  username: string;
  email: string;
  password: string;
}): Promise<AuthSession> {
  const session = await api<AuthSession>("/api/auth/register", {
    method: "POST",
    body: input,
    auth: false,
  });
  setTokens(session.access_token, session.refresh_token);
  return session;
}

export async function login(input: {
  login: string;
  password: string;
}): Promise<AuthSession> {
  const session = await api<AuthSession>("/api/auth/login", {
    method: "POST",
    body: input,
    auth: false,
  });
  setTokens(session.access_token, session.refresh_token);
  return session;
}

export async function logout(): Promise<void> {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    clearTokens();
  }
}

export async function me(): Promise<ServerUser> {
  return api<ServerUser>("/api/users/me");
}

export interface UpdateProfileInput {
  avatar_url?: string;
  bio?: string;
  location?: string;
  website?: string;
}

// Self-service profile update. Returns the full refreshed user row so
// the caller can push it back into the auth store in one hop.
export async function updateMe(input: UpdateProfileInput): Promise<ServerUser> {
  return api<ServerUser>("/api/users/me", {
    method: "PUT",
    body: input,
  });
}

export async function changePassword(
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  await api("/api/users/me/password", {
    method: "POST",
    body: { old_password: oldPassword, new_password: newPassword },
  });
}
