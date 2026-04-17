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
  email_verified_at?: string | null;
}

export interface AuthSession {
  user: ServerUser;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  // True when the site requires email verification and this user
  // hasn't completed it yet. UI should steer them to /verify-email.
  email_verify_required?: boolean;
}

export async function register(input: {
  username: string;
  email: string;
  password: string;
  invite_code?: string;
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

// Ask the backend to send (or resend) the 6-digit email verification
// code to the given address. Backend enforces a 60s cooldown and
// returns a generic success regardless of whether the email is
// registered, so the UI can treat this as fire-and-forget.
export async function sendVerificationEmail(email: string): Promise<void> {
  await api("/api/auth/send-verification", {
    method: "POST",
    body: { email },
    auth: false,
  });
}

export interface VerifyEmailResult {
  user: ServerUser;
  verified: boolean;
}

// Redeem a verification code. On success the user's email_verified_at
// is stamped and we get the fresh row back. Does NOT rotate tokens —
// the existing session stays valid.
export async function verifyEmail(email: string, code: string): Promise<VerifyEmailResult> {
  return api<VerifyEmailResult>("/api/auth/verify-email", {
    method: "POST",
    body: { email, code },
    auth: false,
  });
}

// Kick off a password-reset flow. Backend is deliberately quiet about
// whether the address is registered — the UI always treats the call
// as a success.
export async function forgotPassword(email: string): Promise<void> {
  await api("/api/auth/forgot-password", {
    method: "POST",
    body: { email },
    auth: false,
  });
}

// Redeem a password-reset token. 400 + `reset_token_invalid` when the
// token is missing / expired / already used.
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await api("/api/auth/reset-password", {
    method: "POST",
    body: { token, new_password: newPassword },
    auth: false,
  });
}

// Request changing the current user's email. Sends a 6-digit code to
// new_email; use confirmEmailChange to finish.
export async function requestEmailChange(newEmail: string): Promise<void> {
  await api("/api/users/me/email/request", {
    method: "POST",
    body: { new_email: newEmail },
  });
}

export async function confirmEmailChange(newEmail: string, code: string): Promise<ServerUser> {
  return api<ServerUser>("/api/users/me/email/confirm", {
    method: "POST",
    body: { new_email: newEmail, code },
  });
}
