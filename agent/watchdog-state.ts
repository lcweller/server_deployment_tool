import * as fs from "node:fs";
import * as path from "node:path";

import { instanceInstallDir } from "./paths";

const FILE_NAME = ".steamline-watchdog.json";

export type WatchdogState = {
  /** Consecutive failed auto-restart attempts after the game process died. */
  failures: number;
  /** Epoch ms of the last restart attempt (success or failure). */
  lastAttemptMs: number;
};

function statePath(instanceId: string): string {
  return path.join(instanceInstallDir(instanceId), FILE_NAME);
}

export function readWatchdogState(instanceId: string): WatchdogState | null {
  const p = statePath(instanceId);
  try {
    if (!fs.existsSync(p)) {
      return null;
    }
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw) as Partial<WatchdogState>;
    const failures =
      typeof j.failures === "number" && Number.isFinite(j.failures)
        ? Math.max(0, Math.floor(j.failures))
        : 0;
    const lastAttemptMs =
      typeof j.lastAttemptMs === "number" && Number.isFinite(j.lastAttemptMs)
        ? Math.floor(j.lastAttemptMs)
        : 0;
    return { failures, lastAttemptMs };
  } catch {
    return null;
  }
}

export function writeWatchdogState(instanceId: string, s: WatchdogState): void {
  const p = statePath(instanceId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(s, null, 0)}\n`, "utf8");
}

export function resetWatchdogState(instanceId: string): void {
  try {
    const p = statePath(instanceId);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  } catch {
    /* ignore */
  }
}
