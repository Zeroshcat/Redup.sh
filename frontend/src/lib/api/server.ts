/**
 * Server-side fetch helper for SSR pages. Speaks the same envelope format as
 * the client-side api() but without auth / token refresh — only use for public
 * endpoints (categories, topic lists, topic detail).
 */

import { randomBytes } from "crypto";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

interface Envelope<T> {
  data?: T;
  error?: { code: string; message: string; request_id?: string };
}

export class ServerAPIError extends Error {
  code: string;
  status: number;
  requestId: string;

  constructor(code: string, message: string, status: number, requestId = "") {
    super(message);
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

function newRequestId() {
  return randomBytes(6).toString("hex");
}

export async function apiServer<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const requestId = newRequestId();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": requestId,
      ...init?.headers,
    },
  });
  const serverRid = res.headers.get("X-Request-ID") ?? requestId;
  const body = (await res.json()) as Envelope<T>;
  if (body.error) {
    throw new ServerAPIError(
      body.error.code,
      body.error.message,
      res.status,
      body.error.request_id ?? serverRid,
    );
  }
  return body.data as T;
}
