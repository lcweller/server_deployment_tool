"use client";

import { useEffect, useRef } from "react";

type HostRealtimeEvent = {
  hostId?: string;
  kind?: "heartbeat" | "metrics" | "instances" | "agent_update" | string;
};

const SSE_PATH = "/api/realtime/events";
const MAX_RECONNECT_MS = 60_000;

/**
 * Subscribe to host SSE events with auto-reconnect/backoff.
 * Callback should stay lightweight (it may run frequently during active hosts).
 */
export function useHostRealtimeEvents(
  onHostEvent: (payload: HostRealtimeEvent) => void
): void {
  const cbRef = useRef(onHostEvent);
  cbRef.current = onHostEvent;

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnect: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let closed = false;

    const clearReconnect = () => {
      if (reconnect) {
        clearTimeout(reconnect);
        reconnect = null;
      }
    };

    const connect = () => {
      if (closed) {
        return;
      }
      clearReconnect();
      es?.close();
      es = new EventSource(SSE_PATH);

      es.addEventListener("host", (ev) => {
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as HostRealtimeEvent;
          cbRef.current(payload);
        } catch {
          /* ignore malformed */
        }
      });

      es.addEventListener("ready", () => {
        attempt = 0;
      });

      es.onerror = () => {
        es?.close();
        if (closed) {
          return;
        }
        attempt += 1;
        const delay = Math.min(
          MAX_RECONNECT_MS,
          2000 * 2 ** Math.min(attempt - 1, 8)
        );
        clearReconnect();
        reconnect = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      closed = true;
      clearReconnect();
      es?.close();
      es = null;
    };
  }, []);
}

/** Convenience wrapper for components interested in one host id only. */
export function useHostRealtimeForHost(
  hostId: string | null | undefined,
  onHostEvent: (payload: HostRealtimeEvent) => void
): void {
  useHostRealtimeEvents((payload) => {
    if (!hostId || payload.hostId !== hostId) {
      return;
    }
    onHostEvent(payload);
  });
}
