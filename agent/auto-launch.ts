/**
 * When no STEAMLINE_AFTER_INSTALL_CMD or catalog afterInstallCmd is set,
 * pick a likely dedicated-server binary under the SteamCMD install tree.
 *
 * Heuristic only — wrong picks are possible; operators can disable with
 * STEAMLINE_DISABLE_AUTO_LAUNCH=1 or set an explicit start command.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export type AutoLaunchPlan =
  | {
      kind: "shell";
      /** Passed to spawn(..., { shell: true }) */
      cmd: string;
      cwd: string;
    }
  | {
      kind: "exec";
      file: string;
      args: string[];
      cwd: string;
    };

function resolveBash(): string {
  for (const b of ["/bin/bash", "/usr/bin/bash"]) {
    if (fs.existsSync(b)) {
      return b;
    }
  }
  return "bash";
}

const WIN_EXE_EXCLUDE =
  /steamcmd|crashhandler|steamservice|steamservice\.exe|steamerrorreporter|setup|uninstall|vcredist|dotnet|webview|ffmpeg|dxsetup|ispc|builder|sdk|qtwebengine|cef_|battleye|easyanticheat|redist|msvcp|vulkan|openvr|oculus|nvidia|amd\/|radeon|geforce|physx|uplay|epic|origin|gog galaxy/i;

const MAX_DEPTH = 7;
const MAX_VISIT = 600;

function quoteWinArg(p: string): string {
  return `"${p.replace(/"/g, '""')}"`;
}

function scoreWinExe(full: string, base: string): number {
  const n = base.toLowerCase();
  if (!n.endsWith(".exe")) {
    return -1;
  }
  if (WIN_EXE_EXCLUDE.test(n) || WIN_EXE_EXCLUDE.test(full)) {
    return -1;
  }
  let s = 0;
  const low = full.toLowerCase();
  if (/[\\/]steamapps[\\/]common[\\/]/i.test(low)) {
    s += 25;
  }
  if (/[\\/]tools[\\/]|[\\/]sdk[\\/]|[\\/]editor[\\/]/i.test(low)) {
    s -= 80;
  }
  if (/dedicated|gameserver|_ds\.exe|_server\.exe|srcds|hlds|shooter.*server/i.test(n)) {
    s += 120;
  } else if (/server/i.test(n)) {
    s += 45;
  }
  if (/client|launcher|editor|benchmark|crash/i.test(n)) {
    s -= 60;
  }
  return s;
}

function scoreLinuxBin(full: string, base: string): number {
  let s = 0;
  const low = full.toLowerCase();
  if (/[\\/]steamapps[\\/]common[\\/]/i.test(low)) {
    s += 25;
  }
  if (/[\\/]tools[\\/]|[\\/]sdk[\\/]/i.test(low)) {
    s -= 80;
  }
  if (/dedicated|server|srcds|hlds|_x64|x86_64|\.x86_64$/i.test(base)) {
    s += 90;
  }
  if (/steamcmd|crashhandler|linux32[\\/]steamcmd/i.test(low)) {
    return -1;
  }
  if (/client|editor|benchmark/i.test(base)) {
    s -= 50;
  }
  return s;
}

function scoreShellScript(_full: string, base: string): number {
  const n = base.toLowerCase();
  /** Valve ships extensionless runners (`hlds_run`, `srcds_run`) — they are not `*.sh`. */
  const isKnownRunner =
    n.endsWith(".sh") || /^(hlds_run|srcds_run)$/i.test(base);
  if (!isKnownRunner) {
    return -1;
  }
  if (/uninstall|setup|install|build|configure/i.test(n)) {
    return -1;
  }
  if (/start.*server|server.*start|run.*server|dedicated|srcds_run|hlds_run/i.test(n)) {
    return 95;
  }
  if (/start|run|launch/i.test(n)) {
    return 40;
  }
  return 5;
}

function linuxExecutable(file: string): boolean {
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) {
      return false;
    }
    return (st.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

type Cand = { full: string; score: number; kind: "win_exe" | "linux_bin" | "sh" };

function collectCandidates(installDir: string): Cand[] {
  const out: Cand[] = [];
  let visited = 0;

  function walk(root: string, depth: number): void {
    if (depth > MAX_DEPTH || visited >= MAX_VISIT) {
      return;
    }
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (visited >= MAX_VISIT) {
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
        if (process.platform === "win32") {
          const sc = scoreWinExe(p, e.name);
          if (sc > 0) {
            out.push({ full: p, score: sc, kind: "win_exe" });
          }
        } else {
          const sh = scoreShellScript(p, e.name);
          if (sh > 0) {
            out.push({ full: p, score: sh + (linuxExecutable(p) ? 5 : 0), kind: "sh" });
          }
          const sc = scoreLinuxBin(p, e.name);
          if (sc > 0 && (linuxExecutable(p) || /\.x86_64$/i.test(e.name))) {
            out.push({ full: p, score: sc + (linuxExecutable(p) ? 10 : 0), kind: "linux_bin" });
          }
        }
      }
    }
  }

  walk(installDir, 0);
  out.sort((a, b) => b.score - a.score || a.full.length - b.full.length);
  return out;
}

/**
 * Returns a launch plan, or null if nothing reasonable was found.
 */
export function guessAutoLaunchPlan(installDir: string): AutoLaunchPlan | null {
  if (process.env.STEAMLINE_DISABLE_AUTO_LAUNCH === "1") {
    return null;
  }
  if (!fs.existsSync(installDir)) {
    return null;
  }

  const cands = collectCandidates(installDir);
  const best = cands[0];
  if (!best || best.score < 15) {
    return null;
  }

  const cwd = path.dirname(best.full);

  if (best.kind === "win_exe") {
    return {
      kind: "shell",
      cmd: quoteWinArg(best.full),
      cwd,
    };
  }

  if (best.kind === "linux_bin") {
    return {
      kind: "exec",
      file: best.full,
      args: [],
      cwd,
    };
  }

  /** .sh — run with bash (works without chmod +x) */
  return {
    kind: "exec",
    file: resolveBash(),
    args: [best.full],
    cwd,
  };
}
