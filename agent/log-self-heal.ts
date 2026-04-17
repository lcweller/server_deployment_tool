/**
 * Log-driven auto-diagnosis and limited self-heal for game hosts.
 *
 * Covers common classes of failures (missing OS libs, bad permissions, SteamCMD loader).
 * Not a substitute for game-specific configuration — many issues are surfaced clearly in logs only.
 *
 * Disable all remediations: STEAMLINE_SELF_HEAL_DISABLE=1
 * Disable automatic SteamCMD retry after a successful fix: STEAMLINE_AUTO_RETRY_STEAMCMD=0
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { tryInstallLinuxDepsForSteamline } from "./linux-deps";
import { ensureLinuxSteamCmdLoader } from "./steamcmd-bootstrap";

const MAX_SAME_ISSUE_MS = 45 * 60 * 1000;
const WALK_MAX_DEPTH = 6;
const WALK_MAX_FILES = 400;

export type SelfHealContext = {
  apiBase: string;
  bearer: string;
  instanceId: string;
  /** Instance install root (+force_install_dir). */
  installDir?: string;
  /** SteamCMD extract directory (for loader fixes). */
  steamcmdDir?: string;
  /** For future game-specific rules. */
  steamAppId?: string | null;
};

export type SelfHealResult = {
  /** At least one remediation ran successfully. */
  appliedAny: boolean;
  /** Safe to re-run SteamCMD once (e.g. fixed libc / loader). */
  shouldRetrySteamCmd: boolean;
  /** Lines to post to instance logs (prefixed by caller if needed). */
  logLines: string[];
};

const lastApplied = new Map<string, number>();

function issueCooldownKey(instanceId: string, issueId: string): string {
  return `${instanceId}::${issueId}`;
}

function canApplyIssue(instanceId: string, issueId: string): boolean {
  const k = issueCooldownKey(instanceId, issueId);
  const now = Date.now();
  const prev = lastApplied.get(k) ?? 0;
  if (now - prev < MAX_SAME_ISSUE_MS) {
    return false;
  }
  lastApplied.set(k, now);
  return true;
}

function selfHealDisabled(): boolean {
  return process.env.STEAMLINE_SELF_HEAL_DISABLE === "1";
}

function autoRetrySteamCmdEnabled(): boolean {
  return process.env.STEAMLINE_AUTO_RETRY_STEAMCMD !== "0";
}

function joinLogText(lines: string[]): string {
  return lines.join("\n").toLowerCase();
}

/**
 * chmod +x on common dedicated-server launch scripts under the install tree.
 */
export function ensureGameRunnerScriptsExecutable(installDir: string): {
  chmodCount: number;
  touched: string[];
} {
  const touched: string[] = [];
  let chmodCount = 0;
  let visited = 0;

  function considerFile(full: string, base: string): void {
    if (visited >= WALK_MAX_FILES) {
      return;
    }
    const bl = base.toLowerCase();
    const interesting =
      bl === "hlds_run" ||
      bl === "srcds_run" ||
      bl.endsWith(".sh");
    if (!interesting) {
      return;
    }
    try {
      const st = fs.statSync(full);
      if (!st.isFile()) {
        return;
      }
      if ((st.mode & 0o111) !== 0) {
        return;
      }
      fs.chmodSync(full, st.mode | 0o755);
      chmodCount += 1;
      if (touched.length < 12) {
        touched.push(full);
      }
    } catch {
      /* ignore */
    }
  }

  function walk(root: string, depth: number): void {
    if (depth > WALK_MAX_DEPTH || visited >= WALK_MAX_FILES) {
      return;
    }
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (visited >= WALK_MAX_FILES) {
        return;
      }
      if (e.name === "node_modules" || e.name === ".git") {
        continue;
      }
      const p = path.join(root, e.name);
      if (e.isDirectory()) {
        walk(p, depth + 1);
      } else {
        visited += 1;
        considerFile(p, e.name);
      }
    }
  }

  if (fs.existsSync(installDir)) {
    walk(installDir, 0);
  }

  return { chmodCount, touched };
}

/**
 * Idempotent fixes that are safe to run before every dedicated launch (cheap).
 */
export function quickInstallDirRemediations(installDir: string): string[] {
  if (selfHealDisabled() || !installDir || !fs.existsSync(installDir)) {
    return [];
  }
  const { chmodCount, touched } = ensureGameRunnerScriptsExecutable(installDir);
  if (chmodCount === 0) {
    return [];
  }
  const lines = [
    `[steamline] auto-heal: set executable bit on ${chmodCount} script(s) so launch wrappers can run (${touched
      .map((t) => path.basename(t))
      .join(", ")}${chmodCount > touched.length ? ", …" : ""}).`,
  ];
  return lines;
}

type HealStep = {
  id: string;
  /** Return true if this log text suggests the issue. */
  detect: (text: string, lines: string[]) => boolean;
  /** Apply fix; return whether something changed. */
  remediate: (ctx: SelfHealContext) => { applied: boolean; retrySteam: boolean };
};

const STEPS: HealStep[] = [
  {
    id: "libc_i386_steamcmd",
    detect: (text) =>
      /cannot execute: required file not found/.test(text) ||
      /error while loading shared libraries/.test(text) ||
      /no version information available \(required by/.test(text) ||
      /\/lib\/ld-linux\.so\.2.*not found/.test(text) ||
      /libstdc\+\+\.so\.6.*cannot open shared object/.test(text),
    remediate: (ctx) => {
      if (process.platform !== "linux") {
        return { applied: false, retrySteam: false };
      }
      try {
        tryInstallLinuxDepsForSteamline();
        if (ctx.steamcmdDir) {
          ensureLinuxSteamCmdLoader(ctx.steamcmdDir);
        }
        return { applied: true, retrySteam: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[steamline] auto-heal libc/loader:", msg);
        return { applied: false, retrySteam: false };
      }
    },
  },
  {
    id: "permission_denied_scripts",
    detect: (text) => /permission denied/i.test(text),
    remediate: (ctx) => {
      if (!ctx.installDir || !fs.existsSync(ctx.installDir)) {
        return { applied: false, retrySteam: false };
      }
      const { chmodCount } = ensureGameRunnerScriptsExecutable(ctx.installDir);
      return {
        applied: chmodCount > 0,
        retrySteam: false,
      };
    },
  },
  {
    id: "disk_full",
    detect: (text) =>
      /no space left on device|disk full|enospc/i.test(text),
    remediate: () => ({ applied: false, retrySteam: false }),
  },
];

/**
 * Analyze log lines (e.g. SteamCMD output) and run matching remediations once per cooldown window.
 */
export async function applyLogSelfHealFromLines(
  lines: string[],
  _phase: "steamcmd" | "dedicated",
  ctx: SelfHealContext
): Promise<SelfHealResult> {
  const out: string[] = [];
  if (selfHealDisabled()) {
    return { appliedAny: false, shouldRetrySteamCmd: false, logLines: out };
  }

  const text = joinLogText(lines);
  let appliedAny = false;
  let shouldRetrySteamCmd = false;

  for (const step of STEPS) {
    if (!step.detect(text, lines)) {
      continue;
    }

    if (step.id === "disk_full") {
      out.push(
        "[steamline] auto-heal: logs suggest the disk is full. Free space on this host (or enlarge the volume); Steamline cannot delete game data automatically."
      );
      continue;
    }

    if (!canApplyIssue(ctx.instanceId, step.id)) {
      out.push(
        `[steamline] auto-heal: issue “${step.id}” was already addressed recently — skipping repeat fix.`
      );
      continue;
    }

    try {
      const r = step.remediate(ctx);
      if (r.applied) {
        appliedAny = true;
        if (r.retrySteam) {
          shouldRetrySteamCmd = true;
        }
        out.push(
          `[steamline] auto-heal: applied remediation “${step.id}” (${_phase}).`
        );
      } else if (step.id === "permission_denied_scripts") {
        out.push(
          `[steamline] auto-heal: detected “${step.id}” but no script permissions were changed (paths may differ).`
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.push(`[steamline] auto-heal: remediation “${step.id}” failed: ${msg}`);
    }
  }

  if (shouldRetrySteamCmd && !autoRetrySteamCmdEnabled()) {
    shouldRetrySteamCmd = false;
    out.push(
      "[steamline] auto-heal: STEAMLINE_AUTO_RETRY_STEAMCMD=0 — not retrying SteamCMD automatically."
    );
  }

  return { appliedAny, shouldRetrySteamCmd, logLines: out };
}
