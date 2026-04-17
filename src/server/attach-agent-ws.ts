import type { Server } from "node:http";
import { WebSocketServer } from "ws";

import { runAgentHeartbeatFromJson } from "@/lib/agent/heartbeat-core";
import { appendAgentInstanceLogs } from "@/lib/agent/instance-logs-core";
import { applyAgentInstanceStatus } from "@/lib/agent/instance-status-core";
import { createBackupRun, getBackupRun, updateBackupRun } from "@/lib/backups";
import {
  notifyBackupTerminal,
  notifyFromAgentUpdateEvent,
} from "@/lib/user-notifications";
import { authenticateAgentApiKeyFromRawKey } from "@/lib/auth/agent-api-key";
import { handleAgentTerminalUplink } from "@/lib/terminal/agent-uplink";
import { insertHostAgentUpdateEvent } from "@/lib/agent-update-events";
import { publishHostRealtime } from "@/lib/realtime/host-updates";
import { registerAgentSocket, unregisterAgentSocket } from "@/server/agent-socket-registry";

const WS_PATH = "/api/v1/agent/ws";

export function attachAgentWebSocketServer(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const host = request.headers.host ?? "localhost";
    let pathname: string;
    try {
      pathname = new URL(request.url ?? "/", `http://${host}`).pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== WS_PATH) {
      return;
    }

    void (async () => {
      const auth = request.headers.authorization;
      const raw =
        auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
      const agent = await authenticateAgentApiKeyFromRawKey(raw);
      if (!agent) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        registerAgentSocket(agent.host.id, ws);

        ws.on("message", (data) => {
          void (async () => {
            try {
              const text = data.toString();
              const json = JSON.parse(text) as Record<string, unknown>;
              if (json.type === "agent_update_event") {
                void (async () => {
                  try {
                    await insertHostAgentUpdateEvent(agent.host.id, json);
                  } catch (e) {
                    console.error("[agent-ws] persist agent_update_event failed:", e);
                  }
                  try {
                    await notifyFromAgentUpdateEvent(
                      agent.host.userId,
                      agent.host.id,
                      json
                    );
                  } catch (e) {
                    console.error("[agent-ws] agent_update_event notification failed:", e);
                  }
                })();
                publishHostRealtime(agent.host.userId, {
                  hostId: agent.host.id,
                  kind: "agent_update",
                });
                ws.send(JSON.stringify({ ok: true, type: "ack" }));
                return;
              }
              if (
                json.type === "terminal_data" ||
                json.type === "terminal_error"
              ) {
                handleAgentTerminalUplink(
                  json as {
                    type?: string;
                    sessionId?: string;
                    base64?: string;
                    message?: string;
                  }
                );
                return;
              }
              if (json.type === "instance_status") {
                const instanceId =
                  typeof json.instanceId === "string" ? json.instanceId : "";
                const body = json.body;
                const result = await applyAgentInstanceStatus(
                  agent.host,
                  instanceId,
                  body
                );
                if (!result.ok) {
                  ws.send(
                    JSON.stringify({
                      ok: false,
                      type: "ack",
                      error: result.error,
                    })
                  );
                  return;
                }
                ws.send(JSON.stringify({ ok: true, type: "ack" }));
                return;
              }
              if (json.type === "instance_logs") {
                const instanceId =
                  typeof json.instanceId === "string" ? json.instanceId : "";
                const body = { lines: Array.isArray(json.lines) ? json.lines : [] };
                const result = await appendAgentInstanceLogs(
                  agent.host,
                  instanceId,
                  body
                );
                if (!result.ok) {
                  ws.send(
                    JSON.stringify({
                      ok: false,
                      type: "ack",
                      error: result.error,
                    })
                  );
                  return;
                }
                ws.send(JSON.stringify({ ok: true, type: "ack" }));
                return;
              }
              if (json.type === "backup_test_result") {
                const ok = json.ok === true;
                const message =
                  typeof json.message === "string" ? json.message.slice(0, 4000) : "";
                await createBackupRun({
                  hostId: agent.host.id,
                  kind: "test",
                  status: ok ? "done" : "failed",
                  phase: "complete",
                  message: message || (ok ? "Connection test passed." : "Connection test failed."),
                });
                publishHostRealtime(agent.host.userId, {
                  hostId: agent.host.id,
                  kind: "backup_update",
                });
                ws.send(JSON.stringify({ ok: true, type: "ack" }));
                return;
              }
              if (json.type === "backup_run_event") {
                const runId = typeof json.runId === "string" ? json.runId : "";
                if (!runId) {
                  ws.send(JSON.stringify({ ok: false, type: "ack", error: "Missing runId" }));
                  return;
                }
                const runBefore = await getBackupRun(runId);
                await updateBackupRun(runId, {
                  status: typeof json.status === "string" ? json.status : undefined,
                  phase: typeof json.phase === "string" ? json.phase : undefined,
                  message: typeof json.message === "string" ? json.message : undefined,
                  archivePath:
                    typeof json.archivePath === "string" ? json.archivePath : undefined,
                  checksumSha256:
                    typeof json.checksumSha256 === "string"
                      ? json.checksumSha256
                      : undefined,
                  sizeBytes:
                    typeof json.sizeBytes === "number" ? json.sizeBytes : undefined,
                });
                const st = typeof json.status === "string" ? json.status : "";
                if (st === "done" || st === "failed") {
                  void notifyBackupTerminal({
                    userId: agent.host.userId,
                    hostId: agent.host.id,
                    kind: runBefore?.kind === "restore" ? "restore" : "backup",
                    ok: st === "done",
                    message: typeof json.message === "string" ? json.message : undefined,
                  });
                }
                publishHostRealtime(agent.host.userId, {
                  hostId: agent.host.id,
                  kind: "backup_update",
                });
                ws.send(JSON.stringify({ ok: true, type: "ack" }));
                return;
              }
              if (json.type === "ping") {
                ws.send(JSON.stringify({ ok: true, type: "pong" }));
                return;
              }
              const body =
                json.type === "heartbeat" && json.body !== undefined
                  ? json.body
                  : json;
              const result = await runAgentHeartbeatFromJson(agent.host, body);
              if ("error" in result) {
                ws.send(
                  JSON.stringify({
                    ok: false,
                    error: result.error,
                  })
                );
                return;
              }
              ws.send(JSON.stringify(result.response));
            } catch {
              ws.send(
                JSON.stringify({
                  ok: false,
                  error: "Could not process message",
                })
              );
            }
          })();
        });

        ws.on("close", () => {
          unregisterAgentSocket(agent.host.id, ws);
        });
        ws.on("error", () => {
          unregisterAgentSocket(agent.host.id, ws);
        });
      });
    })();
  });
}
