/**
 * Stable per-machine id for "one agent per OS instance" enrollment.
 * Matches logic in public/install-agent.sh (steamline_machine_fingerprint).
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";

function tryRead(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8").trim().replace(/\s+/g, "");
  } catch {
    return null;
  }
}

export function getMachineFingerprint(): string {
  if (process.platform === "linux") {
    for (const p of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
      const s = tryRead(p);
      if (s && s.length >= 16) {
        return `sl-${s}`;
      }
    }
    const cg = tryRead("/proc/self/cgroup") ?? "nocgroup";
    const h = os.hostname();
    const hash = crypto
      .createHash("sha256")
      .update(`${h}|${cg}`)
      .digest("hex")
      .slice(0, 40);
    return `sl-${hash}`;
  }
  if (process.platform === "darwin") {
    const hash = crypto
      .createHash("sha256")
      .update(`${os.hostname()}|darwin|${os.userInfo().username}`)
      .digest("hex")
      .slice(0, 40);
    return `sl-${hash}`;
  }
  const hash = crypto
    .createHash("sha256")
    .update(
      `${os.hostname()}|${process.platform}|${os.userInfo().username}|${os.machine()}`
    )
    .digest("hex")
    .slice(0, 40);
  return `sl-${hash}`;
}
