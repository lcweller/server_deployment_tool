import WebSocket from "ws";

import { markTerminalAuditClosed } from "@/lib/terminal/audit";

type Entry = {
  hostId: string;
  userId: string;
  browserWs: WebSocket;
  auditRowId: string;
};

const bySession = new Map<string, Entry>();

/** Max concurrent browser terminal sessions per host (spec: 5). */
export const MAX_TERMINAL_SESSIONS_PER_HOST = 5;

export function countTerminalSessionsForHost(hostId: string): number {
  let n = 0;
  for (const e of bySession.values()) {
    if (e.hostId === hostId) {
      n += 1;
    }
  }
  return n;
}

export function registerBrowserTerminalSession(
  sessionId: string,
  hostId: string,
  userId: string,
  browserWs: WebSocket,
  auditRowId: string
): void {
  bySession.set(sessionId, { hostId, userId, browserWs, auditRowId });
}

export function unregisterBrowserTerminalSession(sessionId: string): void {
  bySession.delete(sessionId);
}

export function getBrowserTerminalSession(
  sessionId: string
): Entry | undefined {
  return bySession.get(sessionId);
}

/**
 * Forward PTY output from agent (base64) to the correct browser WebSocket.
 */
export function forwardTerminalDataToBrowser(
  sessionId: string,
  base64: string
): boolean {
  const e = bySession.get(sessionId);
  if (!e || e.browserWs.readyState !== WebSocket.OPEN) {
    return false;
  }
  try {
    e.browserWs.send(
      JSON.stringify({ type: "output", sessionId, base64 })
    );
    return true;
  } catch {
    return false;
  }
}

export function forwardTerminalErrorToBrowser(
  sessionId: string,
  message: string
): boolean {
  const e = bySession.get(sessionId);
  if (!e || e.browserWs.readyState !== WebSocket.OPEN) {
    return false;
  }
  try {
    e.browserWs.send(
      JSON.stringify({ type: "error", sessionId, message })
    );
    return true;
  } catch {
    return false;
  }
}

export function closeAllBrowserSessionsForHost(hostId: string): void {
  for (const [sid, e] of [...bySession.entries()]) {
    if (e.hostId === hostId) {
      void markTerminalAuditClosed(e.auditRowId).catch(() => {
        /* ignore */
      });
      try {
        e.browserWs.close(4000, "agent disconnected");
      } catch {
        /* ignore */
      }
      bySession.delete(sid);
    }
  }
}
