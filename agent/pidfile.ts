/**
 * Optional `steamline.pid` in the instance dir so cleanup can stop a long‑running game process.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import type { ChildProcess } from "node:child_process";

import { instanceInstallDir } from "./paths";

export function pidFilePath(instanceId: string): string {
  return path.join(instanceInstallDir(instanceId), "steamline.pid");
}

export function writeSteamlinePid(instanceId: string, child: ChildProcess): void {
  const pid = child.pid;
  if (pid == null || !Number.isFinite(pid)) {
    return;
  }
  const file = pidFilePath(instanceId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, String(pid), "utf8");
}

export function clearSteamlinePid(instanceId: string): void {
  try {
    const f = pidFilePath(instanceId);
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
    }
  } catch {
    /* ignore */
  }
}
