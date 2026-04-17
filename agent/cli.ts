/**
 * Steamline Linux agent CLI (minimal).
 *
 * Usage:
 *   npx tsx agent/cli.ts enroll <API_BASE_URL> <ENROLLMENT_TOKEN>
 *   STEAMLINE_API_KEY=... npx tsx agent/cli.ts heartbeat <API_BASE_URL>
 *   STEAMLINE_API_KEY=... npx tsx agent/cli.ts run <API_BASE_URL>
 *     → heartbeats + start/stop + watchdog + provisions queued servers (see README)
 *   STEAMLINE_API_KEY=... npx tsx agent/cli.ts instances <API_BASE_URL>
 *   STEAMLINE_API_KEY=... npx tsx agent/cli.ts ack <API_BASE_URL> <INSTANCE_ID>
 *   STEAMLINE_API_KEY=... npx tsx agent/cli.ts steam-login [API_BASE_URL]
 *     → interactive SteamCMD (Steam Guard); optional URL to load saved Steam username hint
 */

import { program } from "commander";

import {
  cleanupPendingDelete,
  fetchHostSelf,
  runHostUninstall,
} from "./cleanup";
import { collectHeartbeatMetrics } from "./collect-metrics";
import { consumeOsUpdateReport } from "./os-update-report";
import { fetchPublicIpv4 } from "./public-ip";
import { loadSteamlineApiKeyEarly } from "./load-api-key";
import {
  processInstanceStart,
  processInstanceStop,
  provisionInstance,
  setInstanceRealtimeUpstream,
  type RemoteInstance,
} from "./provision";
import { processWatchdogQueue } from "./watchdog";
import { performDashboardReboot } from "./reboot";
import { getMachineFingerprint } from "./machine-fingerprint";
import { applyLinuxRootPasswordFromHeartbeat } from "./linux-root-password";
import { persistSteamCredentialsFromDelivery } from "./persist-steam-credentials";
import { runInteractiveSteamLogin } from "./steam-login";
import { AgentWebSocketClient } from "./agent-ws";
import type { HeartbeatJson } from "./heartbeat-types";
import { getAgentVersionLabel } from "./agent-version";
import {
  deleteBackupArtifact,
  runBackupNow,
  runRestoreNow,
  testBackupDestination,
} from "./backup";
import { reconcileLinuxFirewall } from "./linux-firewall-reconcile";
import { applyLinuxHardeningOnce } from "./linux-hardening";
import { runIntegrityMonitorOnce } from "./integrity-monitor";
import {
  applyAgentSelfUpdate,
  buildUpdateEvent,
  checkAgentUpdateFromControl,
  maybeCheckForUpdate,
  rollbackAgentBinary,
  runPostUpdateHealthCheck,
} from "./self-update";
import { handleTerminalControl, setTerminalUpstream } from "./terminal-manager";

loadSteamlineApiKeyEarly();

function bearerHeaders(): HeadersInit {
  const key = process.env.STEAMLINE_API_KEY;
  if (!key) {
    console.error("Set STEAMLINE_API_KEY");
    process.exit(1);
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}

function getBearer(): string {
  const key = process.env.STEAMLINE_API_KEY;
  if (!key) {
    console.error("Set STEAMLINE_API_KEY");
    process.exit(1);
  }
  return key;
}

/** Max queued instances to provision in one run-loop iteration (avoids starving sleep/reboot checks). */
const MAX_PROVISIONS_PER_CYCLE = 32;

async function enroll(
  baseUrl: string,
  opts: { enrollmentToken?: string; pairingCode?: string }
) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/agent/enroll`;
  const body: Record<string, unknown> = {
    agentVersion: getAgentVersionLabel(),
    machineFingerprint: getMachineFingerprint(),
  };
  if (opts.pairingCode) {
    body.pairingCode = opts.pairingCode;
  } else if (opts.enrollmentToken) {
    body.enrollmentToken = opts.enrollmentToken;
  } else {
    console.error("Internal error: no enrollment method");
    process.exit(1);
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    try {
      const j = JSON.parse(text) as { message?: string; error?: string };
      if (j.message) {
        console.error(j.message);
      } else if (j.error) {
        console.error(j.error);
      }
    } catch {
      /* ignore */
    }
    console.error("Enroll failed:", res.status, text);
    process.exit(1);
  }
  console.log(text);
  console.error(
    "\nSave the apiKey securely (e.g. ~/.steamline/steamline-agent.env as STEAMLINE_API_KEY=...)."
  );
  const u = baseUrl.replace(/\/$/, "");
  console.error(
    `\nThe dashboard install script starts the agent in the background after enroll.\n` +
      `Manual run (if needed): cd ~/.steamline && node steamline-agent.cjs run ${u}`
  );
}

async function buildHeartbeatPayload(): Promise<Record<string, unknown>> {
  let metrics: ReturnType<typeof collectHeartbeatMetrics> | undefined;
  try {
    metrics = collectHeartbeatMetrics();
  } catch {
    metrics = undefined;
  }
  if (metrics) {
    try {
      const pub = await fetchPublicIpv4();
      if (pub) {
        metrics = { ...metrics, publicIpv4: pub };
      }
    } catch {
      /* ignore */
    }
  }
  const osUpdateReport = consumeOsUpdateReport();
  return {
    agentVersion: getAgentVersionLabel(),
    ...(metrics ? { metrics } : {}),
    ...(osUpdateReport ? { osUpdateReport } : {}),
  };
}

async function heartbeatOnce(
  baseUrl: string
): Promise<{ ok: boolean; data?: HeartbeatJson; text: string }> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/agent/heartbeat`;
  const body = await buildHeartbeatPayload();
  const res = await fetch(url, {
    method: "POST",
    headers: bearerHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, text };
  }
  try {
    const data = JSON.parse(text) as HeartbeatJson;
    return { ok: true, data, text };
  } catch {
    return { ok: true, text };
  }
}

async function applyHeartbeatSideEffects(
  baseUrl: string,
  data?: HeartbeatJson
) {
  if (data?.deliverSteamCredentials) {
    try {
      persistSteamCredentialsFromDelivery(data.deliverSteamCredentials);
      console.error(
        "[steamline] Steam credentials from the dashboard were written to steamline-agent.env on this machine."
      );
    } catch (e) {
      console.error("[steamline] Could not save Steam credentials locally:", e);
    }
  }
  if (data?.deliverLinuxRootPassword?.password) {
    applyLinuxRootPasswordFromHeartbeat(data.deliverLinuxRootPassword.password);
  }
  if (data?.pendingReboot) {
    console.error("[steamline] Dashboard requested reboot — scheduling…");
    try {
      await performDashboardReboot(baseUrl, getBearer());
    } catch (e) {
      console.error("[steamline] reboot handler failed:", e);
    }
  }
}

async function heartbeat(baseUrl: string) {
  const { ok, data, text } = await heartbeatOnce(baseUrl);
  console.log(text);
  if (!ok) {
    process.exitCode = 1;
  }
  if (data?.promotedInstanceIds?.length) {
    console.error(
      "Queued server instance(s):",
      data.promotedInstanceIds.join(", ")
    );
  }
  if (ok) {
    await applyHeartbeatSideEffects(baseUrl, data);
  }
}

async function fetchInstanceList(
  baseUrl: string,
  bearer: string,
  opts?: { instanceId?: string }
): Promise<RemoteInstance[]> {
  const q =
    opts?.instanceId && /^[0-9a-f-]{36}$/i.test(opts.instanceId)
      ? `?instanceId=${encodeURIComponent(opts.instanceId)}`
      : "";
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/agent/instances${q}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
  if (!res.ok) {
    console.error("instances fetch failed:", res.status, await res.text());
    return [];
  }
  const raw = (await res.json()) as { instances?: RemoteInstance[] };
  return raw.instances ?? [];
}

async function processDeletionQueue(baseUrl: string, onlyInstanceId?: string) {
  const bearer = getBearer();
  for (;;) {
    const list = await fetchInstanceList(
      baseUrl,
      bearer,
      onlyInstanceId ? { instanceId: onlyInstanceId } : undefined
    );
    const del = list.find((i) => i.status === "pending_delete");
    if (!del) {
      break;
    }
    if (onlyInstanceId && del.id !== onlyInstanceId) {
      break;
    }
    try {
      await cleanupPendingDelete(baseUrl, bearer, del);
    } catch (e) {
      console.error("[steamline] cleanup error:", e);
      break;
    }
    if (onlyInstanceId) {
      break;
    }
  }
}

async function maybeRemoveHost(baseUrl: string) {
  const bearer = getBearer();
  const hostJson = await fetchHostSelf(baseUrl, bearer);
  if (!hostJson || hostJson.host.status !== "pending_removal") {
    return;
  }
  const list = await fetchInstanceList(baseUrl, bearer);
  if (list.length > 0) {
    return;
  }
  try {
    await runHostUninstall(baseUrl, bearer, hostJson.host.id);
    console.error(
      "[steamline] Host removed from control plane. Stop this process — API key is gone."
    );
    process.exit(0);
  } catch (e) {
    console.error("[steamline] host removal error:", e);
  }
}

async function processWatchdogPhase(baseUrl: string) {
  const bearer = getBearer();
  const hostJson = await fetchHostSelf(baseUrl, bearer);
  if (hostJson?.host.status === "pending_removal") {
    return;
  }
  const list = await fetchInstanceList(baseUrl, bearer);
  try {
    await processWatchdogQueue(baseUrl, bearer, list);
  } catch (e) {
    console.error("[steamline] watchdog:", e);
  }
}

async function processPowerLifecycle(
  baseUrl: string,
  opts?: { stopForId?: string; startForId?: string }
) {
  const bearer = getBearer();
  const hostJson = await fetchHostSelf(baseUrl, bearer);
  if (hostJson?.host.status === "pending_removal") {
    return;
  }

  const maxPerKind = 8;
  for (let n = 0; n < maxPerKind; n++) {
    const list = await fetchInstanceList(
      baseUrl,
      bearer,
      opts?.stopForId ? { instanceId: opts.stopForId } : undefined
    );
    const stopping = opts?.stopForId
      ? list.find((i) => i.id === opts.stopForId && i.status === "stopping")
      : list.find((i) => i.status === "stopping");
    if (!stopping) {
      break;
    }
    try {
      await processInstanceStop(baseUrl, bearer, stopping);
    } catch (e) {
      console.error("[steamline] stop instance failed:", e);
      break;
    }
    if (opts?.stopForId) {
      break;
    }
  }

  for (let n = 0; n < maxPerKind; n++) {
    const list = await fetchInstanceList(
      baseUrl,
      bearer,
      opts?.startForId ? { instanceId: opts.startForId } : undefined
    );
    const starting = opts?.startForId
      ? list.find((i) => i.id === opts.startForId && i.status === "starting")
      : list.find((i) => i.status === "starting");
    if (!starting) {
      break;
    }
    try {
      await processInstanceStart(baseUrl, bearer, starting);
    } catch (e) {
      console.error("[steamline] start instance failed:", e);
      break;
    }
    if (opts?.startForId) {
      break;
    }
  }
}

async function processProvisionQueue(baseUrl: string) {
  const bearer = getBearer();
  const hostJson = await fetchHostSelf(baseUrl, bearer);
  if (hostJson?.host.status === "pending_removal") {
    return;
  }

  let doneInBatch = 0;
  while (doneInBatch < MAX_PROVISIONS_PER_CYCLE) {
    const list = await fetchInstanceList(baseUrl, bearer);
    const next = list.find((i) => i.status === "queued");
    if (!next) {
      return;
    }

    if (doneInBatch > 0) {
      console.error(
        "[steamline] heartbeat between provisions (host stays online; SteamCMD cache is shared per instance install dir)…"
      );
      const mid = await heartbeatOnce(baseUrl);
      if (mid.ok) {
        await applyHeartbeatSideEffects(baseUrl, mid.data);
      }
      await processPowerLifecycle(baseUrl);
      await processWatchdogPhase(baseUrl);
    }

    console.error(`[steamline] provisioning "${next.name}" (${next.id})…`);
    try {
      await provisionInstance(baseUrl, bearer, next);
      console.error(`[steamline] done ${next.id}`);
    } catch (e) {
      console.error("[steamline] provision error:", e);
      return;
    }
    doneInBatch += 1;
  }

  const list = await fetchInstanceList(baseUrl, bearer);
  if (list.some((i) => i.status === "queued")) {
    console.error(
      `[steamline] provision batch limit (${MAX_PROVISIONS_PER_CYCLE}) reached — remaining queued servers continue next cycle.`
    );
  }
}

async function processProvisionNow(
  baseUrl: string,
  preferredId?: string
): Promise<void> {
  const bearer = getBearer();
  const list = await fetchInstanceList(
    baseUrl,
    bearer,
    preferredId ? { instanceId: preferredId } : undefined
  );
  const next = preferredId
    ? list.find((i) => i.id === preferredId && i.status === "queued")
    : list.find((i) => i.status === "queued");
  if (!next) {
    return;
  }
  await provisionInstance(baseUrl, bearer, next);
}

async function reconcileSecurityState(baseUrl: string): Promise<void> {
  const bearer = getBearer();
  const list = await fetchInstanceList(baseUrl, bearer);
  const running = list
    .filter((i) => i.status === "running" || i.status === "recovering")
    .map((i) => ({ id: i.id, ports: i.allocatedPorts ?? undefined }));
  for (const line of reconcileLinuxFirewall(running)) {
    console.error(line);
  }
}

async function runLoop(baseUrl: string, intervalMs: number) {
  let wsLastSuccess = 0;
  let wsConnected = false;
  const restFallbackStaleMs = 15_000;

  const shouldUseRestHeartbeat = () =>
    process.env.STEAMLINE_DISABLE_AGENT_WS === "1" ||
    !wsConnected ||
    Date.now() - wsLastSuccess > restFallbackStaleMs;

  let sendAuxiliaryJson: ((o: Record<string, unknown>) => void) | null = null;
  let startupRollbackReport =
    process.env.STEAMLINE_UPDATE_ROLLBACK_REPORT?.trim() || "";

  if (process.env.STEAMLINE_DISABLE_AGENT_WS !== "1") {
    let controlChain = Promise.resolve();
    const enqueueControl = (label: string, fn: () => Promise<void>) => {
      controlChain = controlChain.then(async () => {
        try {
          await fn();
        } catch (e) {
          console.error(`[steamline] control ${label} failed:`, e);
        }
      });
    };

    let wsClient: AgentWebSocketClient;
    const bindAgentStreams = () => {
      setInstanceRealtimeUpstream((payload) => {
        if (!wsClient.isConnected()) {
          return false;
        }
        try {
          if (payload.type === "instance_status") {
            wsClient.sendAuxiliaryJson({
              type: "instance_status",
              instanceId: payload.instanceId,
              body: payload.body ?? {},
            });
          } else {
            wsClient.sendAuxiliaryJson({
              type: "instance_logs",
              instanceId: payload.instanceId,
              lines: payload.lines ?? [],
            });
          }
          return true;
        } catch {
          return false;
        }
      });
      setTerminalUpstream((o) => {
        if (!wsClient.isConnected()) {
          return;
        }
        try {
          wsClient.sendAuxiliaryJson(o);
        } catch {
          /* ignore */
        }
      });
    };

    wsClient = new AgentWebSocketClient(
      baseUrl,
      getBearer(),
      {
        onHeartbeatResponse: (data) => {
          wsLastSuccess = Date.now();
          if (data?.promotedInstanceIds?.length) {
            console.error(
              "queued instance(s):",
              data.promotedInstanceIds.join(", ")
            );
          }
          void applyHeartbeatSideEffects(baseUrl, data);
        },
        onConnectionChange: (c) => {
          wsConnected = c;
          if (c && startupRollbackReport) {
            wsClient.sendAuxiliaryJson(buildUpdateEvent("error", startupRollbackReport));
            startupRollbackReport = "";
          }
          if (c) {
            bindAgentStreams();
          } else {
            setInstanceRealtimeUpstream(null);
            setTerminalUpstream(null);
          }
        },
        onControl: (msg) => {
          const m = msg as Record<string, unknown>;
          if (m.type === "control") {
            if (m.action === "apply_agent_update") {
              const tv =
                typeof m.targetVersion === "string" ? m.targetVersion : undefined;
              void applyAgentSelfUpdate(
                baseUrl,
                getBearer(),
                (o) => wsClient.sendAuxiliaryJson(o),
                { targetVersion: tv }
              );
              return;
            }
            if (m.action === "check_agent_update") {
              void checkAgentUpdateFromControl(baseUrl, getBearer(), (o) =>
                wsClient.sendAuxiliaryJson(o)
              );
              return;
            }
            if (m.action === "instance_deploy") {
              const id =
                typeof m.instanceId === "string" && /^[0-9a-f-]{36}$/i.test(m.instanceId)
                  ? m.instanceId
                  : undefined;
              enqueueControl("instance_deploy", async () => {
                await processProvisionNow(baseUrl, id);
              });
              return;
            }
            if (m.action === "instance_stop") {
              const id =
                typeof m.instanceId === "string" && /^[0-9a-f-]{36}$/i.test(m.instanceId)
                  ? m.instanceId
                  : undefined;
              enqueueControl("instance_stop", async () => {
                await processPowerLifecycle(
                  baseUrl,
                  id ? { stopForId: id } : undefined
                );
              });
              return;
            }
            if (m.action === "instance_start") {
              const id =
                typeof m.instanceId === "string" && /^[0-9a-f-]{36}$/i.test(m.instanceId)
                  ? m.instanceId
                  : undefined;
              enqueueControl("instance_start", async () => {
                await processPowerLifecycle(
                  baseUrl,
                  id ? { startForId: id } : undefined
                );
              });
              return;
            }
            if (m.action === "instance_delete") {
              const id =
                typeof m.instanceId === "string" && /^[0-9a-f-]{36}$/i.test(m.instanceId)
                  ? m.instanceId
                  : undefined;
              enqueueControl("instance_delete", async () => {
                await processDeletionQueue(baseUrl, id);
              });
              return;
            }
            if (m.action === "instance_sync" || m.action === "instance_update") {
              enqueueControl("instance_sync", async () => {
                await processDeletionQueue(baseUrl);
                await processPowerLifecycle(baseUrl);
                await processProvisionQueue(baseUrl);
              });
              return;
            }
            if (m.action === "instance_restart") {
              const id =
                typeof m.instanceId === "string" && /^[0-9a-f-]{36}$/i.test(m.instanceId)
                  ? m.instanceId
                  : undefined;
              enqueueControl("instance_restart", async () => {
                if (id) {
                  await processPowerLifecycle(baseUrl, { stopForId: id });
                  await processPowerLifecycle(baseUrl, { startForId: id });
                } else {
                  await processPowerLifecycle(baseUrl);
                }
              });
              return;
            }
            if (m.action === "backup_run") {
              const runId = typeof m.runId === "string" ? m.runId : "";
              const instanceId = typeof m.instanceId === "string" ? m.instanceId : "";
              const destination =
                typeof m.destination === "object" && m.destination
                  ? (m.destination as {
                      id: string;
                      kind: "local" | "s3" | "sftp";
                      name: string;
                      config?: Record<string, unknown>;
                    })
                  : null;
              if (!runId || !instanceId || !destination) {
                return;
              }
              enqueueControl("backup_run", async () => {
                await runBackupNow({
                  runId,
                  instanceId,
                  destination,
                  send: (o) => wsClient.sendAuxiliaryJson(o),
                  apiBase: baseUrl,
                  bearer: getBearer(),
                });
              });
              return;
            }
            if (m.action === "backup_restore") {
              const runId = typeof m.runId === "string" ? m.runId : "";
              const instanceId = typeof m.instanceId === "string" ? m.instanceId : "";
              const backupPath = typeof m.backupPath === "string" ? m.backupPath : "";
              const destination =
                typeof m.destination === "object" && m.destination
                  ? (m.destination as {
                      id: string;
                      kind: "local" | "s3" | "sftp";
                      name: string;
                      config?: Record<string, unknown>;
                    })
                  : null;
              if (!runId || !instanceId || !destination || !backupPath) {
                return;
              }
              enqueueControl("backup_restore", async () => {
                await runRestoreNow({
                  runId,
                  instanceId,
                  destination,
                  backupPath,
                  send: (o) => wsClient.sendAuxiliaryJson(o),
                });
              });
              return;
            }
            if (m.action === "backup_test") {
              const destination =
                typeof m.destination === "object" && m.destination
                  ? (m.destination as {
                      id: string;
                      kind: "local" | "s3" | "sftp";
                      name: string;
                      config?: Record<string, unknown>;
                    })
                  : null;
              if (!destination) {
                return;
              }
              enqueueControl("backup_test", async () => {
                const result = await testBackupDestination({
                  destination,
                  send: (o) => wsClient.sendAuxiliaryJson(o),
                });
                wsClient.sendAuxiliaryJson({
                  type: "backup_test_result",
                  ok: result.ok,
                  message: result.message,
                });
              });
              return;
            }
            if (m.action === "backup_delete") {
              const destination =
                typeof m.destination === "object" && m.destination
                  ? (m.destination as {
                      id: string;
                      kind: "local" | "s3" | "sftp";
                      name: string;
                      config?: Record<string, unknown>;
                    })
                  : null;
              const archivePath =
                typeof m.archivePath === "string" ? m.archivePath : "";
              if (!destination || !archivePath) {
                return;
              }
              enqueueControl("backup_delete", async () => {
                try {
                  await deleteBackupArtifact(destination, archivePath);
                } catch (e) {
                  console.error("[steamline] backup_delete:", e);
                }
              });
              return;
            }
          }
          handleTerminalControl(msg as Record<string, unknown>);
        },
      },
      buildHeartbeatPayload
    );
    wsClient.start();
    const pollScheduledBackups = async () => {
      if (!wsClient.isConnected()) {
        return;
      }
      try {
        const url = `${baseUrl.replace(/\/$/, "")}/api/v1/agent/backup-schedule`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getBearer()}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
        if (!res.ok) {
          return;
        }
        const j = (await res.json()) as {
          runs?: Array<{
            runId: string;
            instanceId: string;
            destination: {
              id: string;
              kind: "local" | "s3" | "sftp";
              name: string;
              config?: Record<string, unknown>;
            };
          }>;
        };
        for (const item of j.runs ?? []) {
          enqueueControl(`backup_scheduled_${item.runId}`, async () => {
            await runBackupNow({
              runId: item.runId,
              instanceId: item.instanceId,
              destination: item.destination,
              send: (o) => wsClient.sendAuxiliaryJson(o),
              apiBase: baseUrl,
              bearer: getBearer(),
            });
          });
        }
      } catch (e) {
        console.error("[steamline] backup-schedule poll:", e);
      }
    };
    setInterval(() => {
      void pollScheduledBackups();
    }, 60_000);
    void pollScheduledBackups();
    sendAuxiliaryJson = (o) => {
      wsClient.sendAuxiliaryJson(o);
    };
  } else {
    setTerminalUpstream(null);
    setInstanceRealtimeUpstream(null);
  }

  const updateIntervalMs = Math.max(
    60_000,
    Number(process.env.STEAMLINE_AGENT_UPDATE_INTERVAL_MS) ||
      6 * 60 * 60 * 1000
  );
  setInterval(() => {
    void maybeCheckForUpdate(
      baseUrl,
      getBearer(),
      sendAuxiliaryJson ?? undefined
    );
  }, updateIntervalMs);

  for (const line of applyLinuxHardeningOnce()) {
    console.error(line);
  }

  const expectedAfterUpdate =
    process.env.STEAMLINE_UPDATE_EXPECTED_VERSION?.trim() || "";
  if (expectedAfterUpdate) {
    const health = await runPostUpdateHealthCheck(
      baseUrl,
      getBearer(),
      expectedAfterUpdate,
      () => wsConnected,
      sendAuxiliaryJson ?? undefined
    );
    if (!health.ok) {
      if (sendAuxiliaryJson) {
        sendAuxiliaryJson(
          buildUpdateEvent(
            "error",
            `Update health-check failed: ${health.error}. Starting automatic rollback...`
          )
        );
      }
      try {
        await rollbackAgentBinary(baseUrl, health.error);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (sendAuxiliaryJson) {
          sendAuxiliaryJson(
            buildUpdateEvent("error", `Rollback failed after update failure: ${message}`)
          );
        }
      }
      process.exit(1);
    }
  }

  const wsLifecycleMs =
    Number(process.env.STEAMLINE_AGENT_WS_LIFECYCLE_INTERVAL_MS) || 300_000;
  const restLifecycleMs =
    Number(process.env.STEAMLINE_AGENT_REST_LIFECYCLE_INTERVAL_MS) || 15_000;
  const loopSleepWs =
    Number(process.env.STEAMLINE_AGENT_LOOP_INTERVAL_MS_WS) || 60_000;

  console.error(
    `steamline-agent: WebSocket + run loop (${intervalMs}ms cycle, REST lifecycle fallback ${restLifecycleMs}ms / WS ${wsLifecycleMs}ms) — Ctrl+C to stop`
  );
  let lastRestLifecycleAt = 0;
  let lastSecurityReconcileAt = 0;
  let lastIntegrityCheckAt = 0;
  for (;;) {
    if (shouldUseRestHeartbeat()) {
      const { ok, data, text } = await heartbeatOnce(baseUrl);
      if (!ok) {
        console.error("heartbeat failed:", text);
      } else if (data?.promotedInstanceIds?.length) {
        console.error(
          "queued instance(s):",
          data.promotedInstanceIds.join(", ")
        );
      }
      if (ok) {
        await applyHeartbeatSideEffects(baseUrl, data);
      }
    }
    const now = Date.now();
    const lifecyclePollMs = wsConnected ? wsLifecycleMs : restLifecycleMs;
    const runRestLifecycle =
      !wsConnected || now - lastRestLifecycleAt > lifecyclePollMs;
    if (runRestLifecycle) {
      await processDeletionQueue(baseUrl);
      await maybeRemoveHost(baseUrl);
      await processPowerLifecycle(baseUrl);
      await processWatchdogPhase(baseUrl);
      await processProvisionQueue(baseUrl);
      lastRestLifecycleAt = now;
    }
    if (process.platform === "linux" && now - lastSecurityReconcileAt > 10_000) {
      try {
        await reconcileSecurityState(baseUrl);
      } catch (e) {
        console.error("[steamline] firewall reconcile:", e);
      }
      lastSecurityReconcileAt = now;
    }
    if (process.platform === "linux" && now - lastIntegrityCheckAt > 300_000) {
      for (const line of runIntegrityMonitorOnce()) {
        console.error(line);
      }
      lastIntegrityCheckAt = now;
    }
    const sleepMs = wsConnected ? Math.max(intervalMs, loopSleepWs) : intervalMs;
    await new Promise((r) => setTimeout(r, sleepMs));
  }
}

async function listInstances(baseUrl: string) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/agent/instances`;
  const res = await fetch(url, { headers: bearerHeaders() });
  const text = await res.text();
  if (!res.ok) {
    console.error("instances failed:", res.status, text);
    process.exit(1);
  }
  console.log(text);
}

async function ackInstance(baseUrl: string, instanceId: string) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/agent/instances/${instanceId}/ack`;
  const res = await fetch(url, { method: "POST", headers: bearerHeaders() });
  const text = await res.text();
  if (!res.ok) {
    console.error("ack failed:", res.status, text);
    process.exit(1);
  }
  console.log(text);
}

program
  .name("steamline-agent")
  .description("Steamline host agent");

program
  .command("enroll")
  .argument("<baseUrl>", "API base URL, e.g. https://game.layeroneconstultants.com")
  .argument(
    "[token]",
    "One-time secret token from the dashboard (omit if using --pairing-code)"
  )
  .option(
    "--pairing-code <code>",
    "Pairing code from Add host (e.g. ABCD-1234) for GameServerOS or typed enroll"
  )
  .action(
    async (
      baseUrl: string,
      token: string | undefined,
      cmdOpts: { pairingCode?: string }
    ) => {
      const pc = cmdOpts.pairingCode?.trim();
      if (pc && token) {
        console.error("Use either the secret token or --pairing-code, not both.");
        process.exit(1);
      }
      if (!pc && !token?.trim()) {
        console.error(
          "Provide the enrollment token from the dashboard, or pass --pairing-code with the eight-character code."
        );
        process.exit(1);
      }
      await enroll(baseUrl, {
        enrollmentToken: token?.trim(),
        pairingCode: pc,
      });
    }
  );

program
  .command("heartbeat")
  .argument("<baseUrl>", "API base URL")
  .action(async (baseUrl: string) => {
    await heartbeat(baseUrl);
  });

program
  .command("run")
  .argument("<baseUrl>", "API base URL")
  .description(
    "Heartbeat loop + automatically provision queued servers created in the dashboard"
  )
  .option(
    "-i, --interval <ms>",
    "Milliseconds between heartbeat/provision cycles",
    String(30_000)
  )
  .action(async (baseUrl: string, opts: { interval: string }) => {
    const intervalMs = Math.max(5000, Number(opts.interval) || 30_000);
    await runLoop(baseUrl, intervalMs);
  });

program
  .command("instances")
  .argument("<baseUrl>", "API base URL")
  .description("List server instances assigned to this host (JSON)")
  .action(async (baseUrl: string) => {
    await listInstances(baseUrl);
  });

program
  .command("ack")
  .argument("<baseUrl>", "API base URL")
  .argument("<instanceId>", "Server instance UUID from the control plane")
  .description("draft → queued (rare; heartbeat does this automatically)")
  .action(async (baseUrl: string, instanceId: string) => {
    await ackInstance(baseUrl, instanceId);
  });

program
  .command("steam-login")
  .argument(
    "[baseUrl]",
    "Optional API base URL — with STEAMLINE_API_KEY, loads dashboard Steam username hint"
  )
  .description(
    "Open interactive SteamCMD on this host (complete Steam Guard; credentials stay local)"
  )
  .action(async (baseUrl?: string) => {
    await runInteractiveSteamLogin(baseUrl);
  });

program.parse();
