import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { hosts } from "@/db/schema";
import { getUserFromCookieHeader } from "@/lib/auth/cookie-header-session";
import { insertTerminalAuditOpen, markTerminalAuditClosed } from "@/lib/terminal/audit";
import {
  countTerminalSessionsForHost,
  MAX_TERMINAL_SESSIONS_PER_HOST,
  registerBrowserTerminalSession,
  unregisterBrowserTerminalSession,
} from "@/lib/terminal/relay-registry";
import { sendControlToAgent } from "@/server/agent-socket-registry";

const WS_PATH = "/api/hosts/ws-terminal";

const openCounts = new Map<string, { n: number; windowStart: number }>();
const MAX_OPENS_PER_HOST_PER_HOUR = 40;

function allowOpen(hostId: string): boolean {
  const now = Date.now();
  const w = openCounts.get(hostId);
  if (!w || now - w.windowStart > 60 * 60 * 1000) {
    openCounts.set(hostId, { n: 1, windowStart: now });
    return true;
  }
  if (w.n >= MAX_OPENS_PER_HOST_PER_HOUR) {
    return false;
  }
  w.n += 1;
  return true;
}

export function createBrowserTerminalWebSocketUpgradeHandler() {
  const wss = new WebSocketServer({ noServer: true });

  return function tryTerminalUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ): boolean {
    const host = request.headers.host ?? "localhost";
    let pathname: string;
    let searchParams: URLSearchParams;
    try {
      const u = new URL(request.url ?? "/", `http://${host}`);
      pathname = u.pathname;
      searchParams = u.searchParams;
    } catch {
      socket.destroy();
      return true;
    }

    if (pathname !== WS_PATH) {
      return false;
    }

    const hostId = searchParams.get("hostId")?.trim();
    if (!hostId) {
      socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return true;
    }

    void (async () => {
      const user = await getUserFromCookieHeader(request.headers.cookie);
      if (!user) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }

      const row = await db
        .select({ id: hosts.id })
        .from(hosts)
        .where(and(eq(hosts.id, hostId), eq(hosts.userId, user.id)))
        .limit(1);

      if (!row[0]) {
        socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }

      if (countTerminalSessionsForHost(hostId) >= MAX_TERMINAL_SESSIONS_PER_HOST) {
        socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }

      if (!allowOpen(hostId)) {
        socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        void (async () => {
          const sessionId = randomUUID();
          let auditId: string;
          try {
            auditId = await insertTerminalAuditOpen({
              hostId,
              userId: user.id,
            });
          } catch {
            try {
              ws.close(1011, "audit failed");
            } catch {
              /* ignore */
            }
            return;
          }

          registerBrowserTerminalSession(
            sessionId,
            hostId,
            user.id,
            ws,
            auditId
          );

          const ok = sendControlToAgent(hostId, {
            channel: "terminal",
            action: "open",
            sessionId,
            cols: 120,
            rows: 32,
          });

          if (!ok) {
            unregisterBrowserTerminalSession(sessionId);
            await markTerminalAuditClosed(auditId);
            try {
              ws.send(
                JSON.stringify({
                  type: "error",
                  sessionId,
                  message:
                    "Agent is not connected over the real-time channel. Use REST fallback or start the agent.",
                })
              );
              ws.close(4003, "agent offline");
            } catch {
              /* ignore */
            }
            return;
          }

          ws.on("message", (data) => {
            try {
              const text = data.toString();
              const j = JSON.parse(text) as {
                type?: string;
                cols?: number;
                rows?: number;
                text?: string;
              };
              if (j.type === "stdin" && typeof j.text === "string") {
                sendControlToAgent(hostId, {
                  channel: "terminal",
                  action: "stdin",
                  sessionId,
                  text: j.text,
                });
                return;
              }
              if (
                j.type === "resize" &&
                typeof j.cols === "number" &&
                typeof j.rows === "number"
              ) {
                sendControlToAgent(hostId, {
                  channel: "terminal",
                  action: "resize",
                  sessionId,
                  cols: j.cols,
                  rows: j.rows,
                });
              }
            } catch {
              /* ignore */
            }
          });

          ws.on("close", () => {
            unregisterBrowserTerminalSession(sessionId);
            void markTerminalAuditClosed(auditId);
            sendControlToAgent(hostId, {
              channel: "terminal",
              action: "close",
              sessionId,
            });
          });

          ws.on("error", () => {
            unregisterBrowserTerminalSession(sessionId);
            void markTerminalAuditClosed(auditId);
            sendControlToAgent(hostId, {
              channel: "terminal",
              action: "close",
              sessionId,
            });
          });

          try {
            ws.send(JSON.stringify({ type: "ready", sessionId }));
          } catch {
            /* ignore */
          }
        })();
      });
    })();

    return true;
  };
}
