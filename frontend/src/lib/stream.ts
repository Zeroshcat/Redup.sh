"use client";

import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/api-client";

// ConnectionStatus surfaces SSE lifecycle to callers so they can render a
// "live vs reconnecting" indicator. "idle" means the hook is disabled or
// has no token and never tried to connect.
export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type Handler = (data: unknown) => void;

/**
 * useStream opens a single SSE connection to /api/stream and dispatches
 * named events to the supplied handlers. Reconnects automatically with
 * exponential backoff when the connection drops, as long as the caller
 * still has a valid auth token.
 *
 * EventSource can't set an Authorization header, so the token is passed as
 * a query parameter. This is fine for the in-memory hub — the token is
 * validated once per connection, then discarded.
 */
export function useStream(
  handlers: Record<string, Handler>,
  enabled: boolean = true,
): ConnectionStatus {
  // Stash handlers in a ref so changing them doesn't tear down the connection.
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  }, [handlers]);

  const [status, setStatus] = useState<ConnectionStatus>("idle");

  useEffect(() => {
    // No setStatus calls in these early-return branches: the initial state
    // is already "idle", and the cleanup from a previous run (on enabled
    // flipping) will have reset it back to "idle" before we re-enter.
    if (!enabled) return;
    const token = getAccessToken();
    if (!token) return;

    let closed = false;
    let es: EventSource | null = null;
    let retry = 0;
    let retryHandle: number | null = null;

    function connect() {
      if (closed) return;
      setStatus((prev) => (prev === "open" ? "reconnecting" : prev === "reconnecting" ? "reconnecting" : "connecting"));
      es = new EventSource(`${API_URL}/api/stream?token=${encodeURIComponent(token!)}`);

      es.addEventListener("open", () => {
        retry = 0;
        setStatus("open");
      });

      // Wildcard dispatch: every named event we know about.
      for (const name of Object.keys(ref.current)) {
        es.addEventListener(name, (ev) => {
          const me = ev as MessageEvent;
          let data: unknown = me.data;
          try {
            data = JSON.parse(me.data);
          } catch {
            /* leave as string */
          }
          ref.current[name]?.(data);
        });
      }

      // hello/keepalive — ignore, just reset retry on any successful read.
      es.addEventListener("hello", () => {
        retry = 0;
        setStatus("open");
      });

      es.addEventListener("error", () => {
        if (closed) return;
        es?.close();
        es = null;
        setStatus("reconnecting");
        // Backoff: 1s, 2s, 4s, … up to 30s.
        retry += 1;
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(retry, 5));
        retryHandle = window.setTimeout(connect, delay);
      });
    }

    connect();

    return () => {
      closed = true;
      if (retryHandle) window.clearTimeout(retryHandle);
      es?.close();
      setStatus("idle");
    };
  }, [enabled]);

  return status;
}
