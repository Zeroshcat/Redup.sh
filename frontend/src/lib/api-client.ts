/**
 * API client — fetch wrapper that speaks the backend's unified envelope:
 *   success: { "data": ... }
 *   error:   { "error": { "code": "...", "message": "..." } }
 *
 * Returns the unwrapped `data` on success, throws APIError on failure.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

const ACCESS_TOKEN_KEY = "redup_access_token";
const REFRESH_TOKEN_KEY = "redup_refresh_token";

export class APIError extends Error {
  code: string;
  status: number;
  requestId: string;
  data: unknown;

  constructor(
    code: string,
    message: string,
    status: number,
    requestId = "",
    data: unknown = undefined,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.data = data;
  }
}

interface Envelope<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
    request_id?: string;
    data?: unknown;
  };
}

function newRequestId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return doRequest<T>(path, opts, true);
}

async function doRequest<T>(
  path: string,
  opts: RequestOptions,
  allowRefresh: boolean,
): Promise<T> {
  const { body, auth = true, headers, ...rest } = opts;

  const requestId = newRequestId();

  // FormData must be sent without Content-Type so the browser sets the
  // multipart boundary automatically.
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Request-ID": requestId,
    ...((headers as Record<string, string>) ?? {}),
  };
  if (isFormData) {
    delete finalHeaders["Content-Type"];
  }

  if (auth) {
    const token = getAccessToken();
    if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const serverRid = res.headers.get("X-Request-ID") ?? requestId;

  let envelope: Envelope<T> | null = null;
  try {
    envelope = (await res.json()) as Envelope<T>;
  } catch {
    throw new APIError("network_error", "invalid JSON response", res.status, serverRid);
  }

  if (envelope.error) {
    // Try one automatic refresh on 401 token errors.
    if (
      allowRefresh &&
      res.status === 401 &&
      envelope.error.code === "token_invalid" &&
      getRefreshToken()
    ) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        return doRequest<T>(path, opts, false);
      }
      clearTokens();
    }
    throw new APIError(
      envelope.error.code,
      envelope.error.message,
      res.status,
      envelope.error.request_id ?? serverRid,
      envelope.error.data,
    );
  }

  return envelope.data as T;
}

async function tryRefresh(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    const envelope = (await res.json()) as Envelope<{
      access_token: string;
      refresh_token: string;
    }>;
    if (envelope.data) {
      setTokens(envelope.data.access_token, envelope.data.refresh_token);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
