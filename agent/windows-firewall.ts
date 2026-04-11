/**
 * Windows only: add inbound allow rules for game/query/RCON ports (UDP + TCP).
 * Requires an elevated agent or policy allowing netsh; failures are logged only.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const RULES_FILE = ".steamline-firewall-rules.json";

function ruleName(instanceId: string, proto: string, port: number): string {
  const id = instanceId.replace(/-/g, "").slice(0, 12);
  return `Steamline-${id}-${proto}-${port}`;
}

function deleteRuleIfExists(name: string): void {
  spawnSync(
    "netsh",
    ["advfirewall", "firewall", "delete", "rule", `name=${name}`],
    { encoding: "utf8", windowsHide: true, stdio: "ignore" }
  );
}

function addRule(name: string, proto: "UDP" | "TCP", port: number): string {
  deleteRuleIfExists(name);
  const r = spawnSync(
    "netsh",
    [
      "advfirewall",
      "firewall",
      "add",
      "rule",
      `name=${name}`,
      "dir=in",
      "action=allow",
      `protocol=${proto}`,
      `localport=${port}`,
    ],
    { encoding: "utf8", windowsHide: true }
  );
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (r.status !== 0) {
    return `netsh add "${name}" failed (exit ${r.status}): ${out || "(no output)"}`;
  }
  return `netsh add "${name}" OK`;
}

/**
 * Deletes rules recorded in `installDir/.steamline-firewall-rules.json` (rule names).
 */
export function removeWindowsFirewallRulesForInstance(installDir: string): string[] {
  const logs: string[] = [];
  if (process.platform !== "win32") {
    return logs;
  }
  const fp = path.join(installDir, RULES_FILE);
  if (!fs.existsSync(fp)) {
    return logs;
  }
  let names: string[] = [];
  try {
    names = JSON.parse(fs.readFileSync(fp, "utf8")) as string[];
    if (!Array.isArray(names)) {
      names = [];
    }
  } catch {
    return logs;
  }
  for (const name of names) {
    if (typeof name !== "string" || !name.startsWith("Steamline-")) {
      continue;
    }
    const r = spawnSync(
      "netsh",
      ["advfirewall", "firewall", "delete", "rule", `name=${name}`],
      { encoding: "utf8", windowsHide: true }
    );
    logs.push(
      r.status === 0
        ? `Removed firewall rule "${name}"`
        : `Could not remove rule "${name}" (exit ${r.status})`
    );
  }
  try {
    fs.unlinkSync(fp);
  } catch {
    /* ignore */
  }
  return logs;
}

/**
 * Creates inbound rules and persists their names next to the instance install dir.
 */
export function applyWindowsFirewallForPorts(
  instanceId: string,
  installDir: string,
  ports: { game?: number; query?: number; rcon?: number }
): string[] {
  const logs: string[] = [];
  if (process.platform !== "win32") {
    return logs;
  }
  if (process.env.STEAMLINE_SKIP_FIREWALL === "1") {
    logs.push("[steamline] STEAMLINE_SKIP_FIREWALL=1 — skipping Windows Firewall rules.");
    return logs;
  }

  const uniq = new Set<number>();
  for (const p of [ports.game, ports.query, ports.rcon]) {
    if (typeof p === "number" && p > 0 && p <= 65535) {
      uniq.add(p);
    }
  }
  if (uniq.size === 0) {
    return logs;
  }

  const names: string[] = [];
  for (const port of uniq) {
    for (const proto of ["UDP", "TCP"] as const) {
      const name = ruleName(instanceId, proto, port);
      names.push(name);
      logs.push(addRule(name, proto, port));
    }
  }

  try {
    fs.writeFileSync(
      path.join(installDir, RULES_FILE),
      JSON.stringify(names, null, 0),
      "utf8"
    );
  } catch (e) {
    logs.push(
      `[steamline] Could not save firewall rule list: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  return logs;
}
