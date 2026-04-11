/**
 * Linux: best-effort open ports via firewalld (session rules when possible).
 * Skips if firewall-cmd missing or not permitted.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const STATE = ".steamline-linux-firewall.json";

type Stored = { usedFirewalld: boolean; ports: number[] };

function hasFirewallCmd(): boolean {
  const r = spawnSync("sh", ["-c", "command -v firewall-cmd"], {
    encoding: "utf8",
    windowsHide: true,
  });
  return r.status === 0 && (r.stdout ?? "").trim().length > 0;
}

export function applyLinuxFirewallForPorts(
  installDir: string,
  ports: { game?: number; query?: number; rcon?: number }
): string[] {
  const logs: string[] = [];
  if (process.platform === "win32" || process.platform === "darwin") {
    return logs;
  }
  if (process.env.STEAMLINE_SKIP_LINUX_FIREWALL === "1") {
    logs.push(
      "[steamline] STEAMLINE_SKIP_LINUX_FIREWALL=1 — skipping firewalld port opens."
    );
    return logs;
  }
  if (!hasFirewallCmd()) {
    logs.push(
      "[steamline] firewalld (firewall-cmd) not found — skipping Linux host firewall automation."
    );
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

  const opened: number[] = [];
  for (const port of uniq) {
    for (const proto of ["udp", "tcp"] as const) {
      const r = spawnSync(
        "firewall-cmd",
        [`--add-port=${port}/${proto}`],
        { encoding: "utf8", windowsHide: true }
      );
      const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
      if (r.status === 0) {
        logs.push(`firewall-cmd: opened ${port}/${proto}`);
        opened.push(port);
      } else {
        logs.push(
          `firewall-cmd ${port}/${proto} failed (exit ${r.status}): ${tail || "no output"}`
        );
      }
    }
  }

  if (opened.length > 0) {
    try {
      const data: Stored = {
        usedFirewalld: true,
        ports: [...new Set(opened)],
      };
      fs.writeFileSync(
        path.join(installDir, STATE),
        JSON.stringify(data, null, 0),
        "utf8"
      );
    } catch (e) {
      logs.push(
        `[steamline] Could not save Linux firewall state: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return logs;
}

export function removeLinuxFirewallForPorts(installDir: string): string[] {
  const logs: string[] = [];
  if (process.platform === "win32" || process.platform === "darwin") {
    return logs;
  }
  const fp = path.join(installDir, STATE);
  if (!fs.existsSync(fp)) {
    return logs;
  }
  let data: Stored;
  try {
    data = JSON.parse(fs.readFileSync(fp, "utf8")) as Stored;
  } catch {
    return logs;
  }
  if (!data.usedFirewalld || !Array.isArray(data.ports)) {
    return logs;
  }
  if (!hasFirewallCmd()) {
    return logs;
  }
  for (const port of data.ports) {
    for (const proto of ["udp", "tcp"] as const) {
      const r = spawnSync(
        "firewall-cmd",
        [`--remove-port=${port}/${proto}`],
        { encoding: "utf8", windowsHide: true, stdio: "pipe" }
      );
      logs.push(
        r.status === 0
          ? `firewall-cmd: removed ${port}/${proto}`
          : `firewall-cmd remove ${port}/${proto} exit ${r.status}`
      );
    }
  }
  try {
    fs.unlinkSync(fp);
  } catch {
    /* ignore */
  }
  return logs;
}
