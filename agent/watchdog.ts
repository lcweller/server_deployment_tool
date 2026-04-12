/**
 * Minimal self-heal: if a `running` / `recovering` instance had a dedicated PID
 * recorded in steamline.pid and that process exits, attempt a bounded automatic
 * restart with backoff (same launch path as dashboard Start).
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { instanceInstallDir } from "./paths";
import type { RemoteInstance } from "./provision";
import {
  postInstanceStatus,
  postLogLines,
  runDedicatedLaunchPhase,
} from "./provision";
import { isProcessLikelyAlive } from "./process-alive";
import {
  readWatchdogState,
  resetWatchdogState,
  writeWatchdogState,
} from "./watchdog-state";

const MAX_FAILURES = 5;
const MIN_BACKOFF_MS = 12_000;
const MAX_BACKOFF_MS = 180_000;

function backoffMs(failures: number): number {
  const exp = MIN_BACKOFF_MS * 2 ** Math.max(0, failures - 1);
  return Math.min(MAX_BACKOFF_MS, Math.floor(exp));
}

function readPid(instanceId: string): number | null {
  const pidFile = path.join(instanceInstallDir(instanceId), "steamline.pid");
  try {
    if (!fs.existsSync(pidFile)) {
      return null;
    }
    const raw = fs.readFileSync(pidFile, "utf8").trim();
    const pid = Number(raw);
    if (!Number.isFinite(pid) || pid <= 0) {
      return null;
    }
    return pid;
  } catch {
    return null;
  }
}

/**
 * At most one heavy restart per invocation to keep the agent loop responsive.
 * @returns true if a restart attempt was started or completed this tick.
 */
export async function processWatchdogQueue(
  apiBase: string,
  bearer: string,
  instances: RemoteInstance[]
): Promise<boolean> {
  if (process.env.STEAMLINE_WATCHDOG_DISABLE === "1") {
    return false;
  }

  const candidates = instances.filter(
    (i) => i.status === "running" || i.status === "recovering"
  );

  const now = Date.now();
  for (const inst of candidates) {
    const pid = readPid(inst.id);
    if (pid == null) {
      if (inst.status === "recovering") {
        try {
          await postInstanceStatus(apiBase, bearer, inst.id, {
            status: "running",
            message:
              "Watchdog cleared: no steamline.pid on disk (server may not use a tracked process).",
          });
        } catch {
          /* ignore */
        }
      }
      continue;
    }

    if (isProcessLikelyAlive(pid)) {
      if (inst.status === "recovering") {
        try {
          await postInstanceStatus(apiBase, bearer, inst.id, {
            status: "running",
            message:
              "Game server process is healthy again (watchdog check passed).",
          });
          resetWatchdogState(inst.id);
        } catch {
          /* ignore */
        }
      }
      continue;
    }

    const st = readWatchdogState(inst.id) ?? { failures: 0, lastAttemptMs: 0 };
    if (st.failures >= MAX_FAILURES) {
      try {
        await postLogLines(apiBase, bearer, inst.id, [
          `[steamline] watchdog: gave up after ${MAX_FAILURES} failed restart attempts — set STEAMLINE_WATCHDOG_DISABLE=1 to silence, or fix the start command / game files.`,
        ]);
        await postInstanceStatus(apiBase, bearer, inst.id, {
          status: "failed",
          message: `Watchdog could not keep the game process running after ${MAX_FAILURES} automatic restart attempts. See instance logs and verify your start command or game configuration.`,
        });
        resetWatchdogState(inst.id);
      } catch {
        /* ignore */
      }
      return true;
    }

    const wait = backoffMs(st.failures);
    if (st.lastAttemptMs > 0 && now - st.lastAttemptMs < wait) {
      continue;
    }

    const dir = instanceInstallDir(inst.id);
    const steamApps = path.join(dir, "steamapps");
    if (!fs.existsSync(steamApps)) {
      try {
        await postInstanceStatus(apiBase, bearer, inst.id, {
          status: "failed",
          message:
            "Watchdog: game install directory is missing — automatic restart is not possible.",
        });
        resetWatchdogState(inst.id);
      } catch {
        /* ignore */
      }
      return true;
    }

    try {
      await postLogLines(apiBase, bearer, inst.id, [
        `[steamline] watchdog: process ${pid} is not running — automatic restart attempt ${st.failures + 1}/${MAX_FAILURES}…`,
      ]);
    } catch {
      /* ignore */
    }

    if (inst.status === "running") {
      try {
        await postInstanceStatus(apiBase, bearer, inst.id, {
          status: "recovering",
          message:
            "Steamline detected the game process stopped and is restarting it automatically…",
        });
      } catch {
        return false;
      }
    }

    try {
      const { dedicatedStarted } = await runDedicatedLaunchPhase(
        apiBase,
        bearer,
        inst,
        dir,
        "restart_from_stopped"
      );

      if (dedicatedStarted) {
        resetWatchdogState(inst.id);
        await postInstanceStatus(apiBase, bearer, inst.id, {
          status: "running",
          message:
            "Dedicated server restarted automatically after the previous process exited (watchdog).",
        });
      } else {
        writeWatchdogState(inst.id, {
          failures: st.failures + 1,
          lastAttemptMs: now,
        });
        await postInstanceStatus(apiBase, bearer, inst.id, {
          status: "recovering",
          message: `Automatic restart did not start a new process (attempt ${st.failures + 1}/${MAX_FAILURES}). Another try is scheduled after a short wait — see logs.`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeWatchdogState(inst.id, {
        failures: st.failures + 1,
        lastAttemptMs: now,
      });
      try {
        await postLogLines(apiBase, bearer, inst.id, [
          `[steamline] watchdog: restart error: ${msg}`,
        ]);
        await postInstanceStatus(apiBase, bearer, inst.id, {
          status: "recovering",
          message: `Watchdog hit an error while restarting (${msg}). Will retry if limits allow.`,
        });
      } catch {
        /* ignore */
      }
    }

    return true;
  }

  return false;
}
