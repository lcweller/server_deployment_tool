import WebSocket from "ws";

import { closeAllBrowserSessionsForHost } from "@/lib/terminal/relay-registry";

const sockets = new Map<string, WebSocket>();

export function registerAgentSocket(hostId: string, ws: WebSocket): void {
  const prev = sockets.get(hostId);
  if (prev && prev !== ws) {
    try {
      prev.close(4000, "replaced");
    } catch {
      /* ignore */
    }
  }
  sockets.set(hostId, ws);
}

export function unregisterAgentSocket(hostId: string, ws: WebSocket): void {
  if (sockets.get(hostId) === ws) {
    sockets.delete(hostId);
    closeAllBrowserSessionsForHost(hostId);
  }
}

export function getAgentSocket(hostId: string): WebSocket | undefined {
  return sockets.get(hostId);
}

export function sendControlToAgent(
  hostId: string,
  message: Record<string, unknown>
): boolean {
  const ws = sockets.get(hostId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  try {
    ws.send(JSON.stringify({ type: "control", ...message }));
    return true;
  } catch {
    return false;
  }
}
