/**
 * Remove instance data, optional game PID, and notify control plane.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import type { RemoteInstance } from "./provision";
import { instanceInstallDir } from "./paths";
import { removeLinuxFirewallForPorts } from "./linux-firewall";
import { removeUpnpPortMappings } from "./upnp-portmap";
import { removeWindowsFirewallRulesForInstance } from "./windows-firewall";

function base(apiBase: string) {
  return apiBase.replace(/\/$/, "");
}

function steamlineDataRoot(): string {
  return (
    process.env.STEAMLINE_DATA_ROOT ??
    path.join(process.cwd(), "steamline-data")
  );
}

function killPidFileIfAny(instanceId: string): void {
  const pidFile = path.join(instanceInstallDir(instanceId), "steamline.pid");
  if (!fs.existsSync(pidFile)) {
    return;
  }
  try {
    const raw = fs.readFileSync(pidFile, "utf8").trim();
    const pid = Number(raw);
    if (!Number.isFinite(pid) || pid <= 0) {
      return;
    }
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      process.kill(pid, "SIGTERM");
    }
  } catch {
    /* ignore */
  }
}

/** Stop game process (best-effort) — used for dashboard Stop and for delete. */
export function killGameProcessForInstance(instanceId: string): void {
  killPidFileIfAny(instanceId);
}

/**
 * Remove UPnP + host firewall rules for this instance (files stay on disk).
 * Safe to call when the install directory is missing (no-op).
 */
export async function tearDownNetworkingForInstance(
  instanceId: string
): Promise<void> {
  const dir = instanceInstallDir(instanceId);
  if (!fs.existsSync(dir)) {
    return;
  }
  const upnpLogs = await removeUpnpPortMappings(dir);
  for (const line of upnpLogs) {
    console.error(`[steamline] ${line}`);
  }
  const lfLogs = removeLinuxFirewallForPorts(dir);
  for (const line of lfLogs) {
    console.error(`[steamline] ${line}`);
  }
  const fwLogs = removeWindowsFirewallRulesForInstance(dir);
  for (const line of fwLogs) {
    console.error(`[steamline] ${line}`);
  }
}

/** Remove stale `steamline.pid` after the process has been stopped. */
export function removeInstancePidFile(instanceId: string): void {
  const pidFile = path.join(instanceInstallDir(instanceId), "steamline.pid");
  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
  } catch {
    /* ignore */
  }
}

async function postPurgeComplete(
  apiBase: string,
  bearer: string,
  instanceId: string
): Promise<void> {
  const url = `${base(apiBase)}/api/v1/agent/instances/${instanceId}/purge-complete`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({}),
  });
  if (res.ok || res.status === 404) {
    return;
  }
  const t = await res.text();
  throw new Error(`purge-complete ${res.status}: ${t}`);
}

export async function cleanupPendingDelete(
  apiBase: string,
  bearer: string,
  inst: RemoteInstance
): Promise<void> {
  if (inst.status !== "pending_delete") {
    return;
  }
  console.error(`[steamline] deleting instance "${inst.name}" (${inst.id})…`);
  killGameProcessForInstance(inst.id);
  const dir = instanceInstallDir(inst.id);
  try {
    if (fs.existsSync(dir)) {
      await tearDownNetworkingForInstance(inst.id);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {
    console.error("[steamline] rm instance dir:", e);
  }
  await postPurgeComplete(apiBase, bearer, inst.id);
  console.error(`[steamline] purged ${inst.id}`);
}

type HostSelf = {
  host: { id: string; status: string; steamUsername?: string | null };
};

export async function fetchHostSelf(
  apiBase: string,
  bearer: string
): Promise<HostSelf | null> {
  const url = `${base(apiBase)}/api/v1/agent/host`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as HostSelf;
}

export async function runHostUninstall(
  apiBase: string,
  bearer: string,
  hostId: string
): Promise<void> {
  const root = steamlineDataRoot();
  const script = process.env.STEAMLINE_UNINSTALL_SCRIPT;

  console.error(`[steamline] host ${hostId} removal — wiping ${root}…`);

  if (script && fs.existsSync(script)) {
    try {
      if (process.platform === "win32") {
        spawnSync("powershell.exe", ["-NoProfile", "-File", script], {
          stdio: "inherit",
          cwd: process.cwd(),
        });
      } else {
        spawnSync("/bin/bash", [script], { stdio: "inherit", cwd: process.cwd() });
      }
    } catch (e) {
      console.error("[steamline] uninstall script error:", e);
    }
  }

  try {
    if (fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  } catch (e) {
    console.error("[steamline] rm steamline-data:", e);
  }

  const url = `${base(apiBase)}/api/v1/agent/host/removal-complete`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`removal-complete ${res.status}: ${t}`);
  }
  console.error("[steamline] host removed from control plane.");
}
