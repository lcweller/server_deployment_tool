/**
 * Steamline Linux agent CLI (minimal).
 *
 * Usage:
 *   npx tsx agent/cli.ts enroll <API_BASE_URL> <ENROLLMENT_TOKEN>
 *   STEAMLINE_API_KEY=... npx tsx agent/cli.ts heartbeat <API_BASE_URL>
 *   STEAMLINE_API_KEY=... npx tsx agent/cli.ts run <API_BASE_URL>
 *     → heartbeats + provisions queued servers (stub or SteamCMD — see README)
 *   STEAMLINE_API_KEY=... npx tsx agent/cli.ts instances <API_BASE_URL>
 *   STEAMLINE_API_KEY=... npx tsx agent/cli.ts ack <API_BASE_URL> <INSTANCE_ID>
 */

import { program } from "commander";

import {
  cleanupPendingDelete,
  fetchHostSelf,
  runHostUninstall,
} from "./cleanup";
import { collectHeartbeatMetrics } from "./collect-metrics";
import { loadSteamlineApiKeyEarly } from "./load-api-key";
import { provisionInstance, type RemoteInstance } from "./provision";
import { performDashboardReboot } from "./reboot";
import { getMachineFingerprint } from "./machine-fingerprint";

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

async function enroll(baseUrl: string, token: string) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/agent/enroll`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      enrollmentToken: token,
      agentVersion: "steamline-agent/0.1.0",
      machineFingerprint: getMachineFingerprint(),
    }),
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

type HeartbeatJson = {
  ok?: boolean;
  promotedInstanceIds?: string[];
  pendingReboot?: boolean;
};

async function heartbeatOnce(
  baseUrl: string
): Promise<{ ok: boolean; data?: HeartbeatJson; text: string }> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/agent/heartbeat`;
  let metrics: ReturnType<typeof collectHeartbeatMetrics> | undefined;
  try {
    metrics = collectHeartbeatMetrics();
  } catch {
    metrics = undefined;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: bearerHeaders(),
    body: JSON.stringify({
      agentVersion: "steamline-agent/0.1.0",
      ...(metrics ? { metrics } : {}),
    }),
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
  if (ok && data?.pendingReboot) {
    console.error("[steamline] Dashboard requested reboot — scheduling…");
    try {
      await performDashboardReboot(baseUrl, getBearer());
    } catch (e) {
      console.error("[steamline] reboot handler failed:", e);
    }
  }
}

async function fetchInstanceList(
  baseUrl: string,
  bearer: string
): Promise<RemoteInstance[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/agent/instances`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
  if (!res.ok) {
    console.error("instances fetch failed:", res.status, await res.text());
    return [];
  }
  const raw = (await res.json()) as { instances?: RemoteInstance[] };
  return raw.instances ?? [];
}

async function processDeletionQueue(baseUrl: string) {
  const bearer = getBearer();
  for (;;) {
    const list = await fetchInstanceList(baseUrl, bearer);
    const del = list.find((i) => i.status === "pending_delete");
    if (!del) {
      break;
    }
    try {
      await cleanupPendingDelete(baseUrl, bearer, del);
    } catch (e) {
      console.error("[steamline] cleanup error:", e);
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

async function processProvisionQueue(baseUrl: string) {
  const bearer = getBearer();
  const list = await fetchInstanceList(baseUrl, bearer);
  const hostJson = await fetchHostSelf(baseUrl, bearer);
  if (hostJson?.host.status === "pending_removal") {
    return;
  }
  const next = list.find((i) => i.status === "queued");
  if (!next) {
    return;
  }
  console.error(`[steamline] provisioning "${next.name}" (${next.id})…`);
  try {
    await provisionInstance(baseUrl, bearer, next);
    console.error(`[steamline] done ${next.id}`);
  } catch (e) {
    console.error("[steamline] provision error:", e);
  }
}

async function runLoop(baseUrl: string, intervalMs: number) {
  console.error(
    `steamline-agent: heartbeat + deletions + provision every ${intervalMs}ms — Ctrl+C to stop`
  );
  for (;;) {
    const { ok, data, text } = await heartbeatOnce(baseUrl);
    if (!ok) {
      console.error("heartbeat failed:", text);
    } else if (data?.promotedInstanceIds?.length) {
      console.error(
        "queued instance(s):",
        data.promotedInstanceIds.join(", ")
      );
    }
    if (ok && data?.pendingReboot) {
      console.error("[steamline] Dashboard requested reboot — scheduling…");
      try {
        await performDashboardReboot(baseUrl, getBearer());
      } catch (e) {
        console.error("[steamline] reboot handler failed:", e);
      }
    }
    await processDeletionQueue(baseUrl);
    await maybeRemoveHost(baseUrl);
    await processProvisionQueue(baseUrl);
    await new Promise((r) => setTimeout(r, intervalMs));
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
  .argument("<token>", "One-time enrollment token from the dashboard")
  .action(async (baseUrl: string, token: string) => {
    await enroll(baseUrl, token);
  });

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

program.parse();
