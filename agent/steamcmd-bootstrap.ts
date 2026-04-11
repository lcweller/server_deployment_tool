/**
 * Download and extract Valve SteamCMD if not already present.
 *
 * One extracted SteamCMD tree is shared per host under `cacheRoot()` (see `.ready` marker).
 * Each game server instance uses its own install directory (`instanceInstallDir`); only SteamCMD
 * is reused, not game files. Provisions run sequentially so two SteamCMD processes do not fight
 * over the same cache directory.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { tryInstallLinuxDepsForSteamline } from "./linux-deps";

const LINUX_URL =
  "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz";
const WIN_URL =
  "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";

function cacheRoot(): string {
  return path.join(
    process.env.STEAMLINE_STEAMCMD_CACHE ??
      path.join(process.cwd(), "steamline-data", ".cache", "steamcmd"),
    process.platform === "win32" ? "windows" : "linux"
  );
}

function walkFindFile(root: string, names: Set<string>): string | null {
  const stack = [root];
  while (stack.length) {
    const d = stack.pop()!;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of ents) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (!ent.name.startsWith(".")) {
          stack.push(p);
        }
      } else if (names.has(ent.name)) {
        return p;
      }
    }
  }
  return null;
}

export type SteamCmdLaunch = {
  command: string;
  /** Extra args before +force_install_dir (e.g. path to steamcmd.sh for bash) */
  leadArgs: string[];
  steamcmdDir: string;
};

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed ${res.status}: ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}

function extractLinux(tgz: string, outDir: string): void {
  fs.mkdirSync(outDir, { recursive: true });
  execFileSync("tar", ["-xzf", tgz, "-C", outDir], { stdio: "inherit" });
}

function extractWin(zip: string, outDir: string): void {
  fs.mkdirSync(outDir, { recursive: true });
  const z = zip.replace(/'/g, "''");
  const o = outDir.replace(/'/g, "''");
  execFileSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Expand-Archive -LiteralPath '${z}' -DestinationPath '${o}' -Force`,
  ], { stdio: "inherit" });
}

/**
 * SteamCMD's steamcmd.sh expects bash. Alpine/minimal images often lack /bin/bash → exit 127.
 */
function resolveLinuxBash(): string {
  if (process.env.STEAMLINE_BASH_PATH?.trim()) {
    return process.env.STEAMLINE_BASH_PATH.trim();
  }
  for (const p of ["/usr/bin/bash", "/bin/bash", "/usr/local/bin/bash"]) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error(
    "SteamCMD requires bash (steamcmd.sh). Install it, e.g. apt install bash / apk add bash / dnf install bash, or set STEAMLINE_BASH_PATH to your bash binary."
  );
}

function resolveLaunchFromDir(dir: string): SteamCmdLaunch {
  const winExe = walkFindFile(dir, new Set(["steamcmd.exe"]));
  if (winExe) {
    return { command: winExe, leadArgs: [], steamcmdDir: dir };
  }
  const sh = walkFindFile(dir, new Set(["steamcmd.sh"]));
  if (sh) {
    try {
      fs.chmodSync(sh, 0o755);
    } catch {
      /* ignore */
    }
    const bash =
      process.platform === "win32"
        ? process.env.STEAMLINE_BASH_PATH ?? "bash.exe"
        : resolveLinuxBash();
    return { command: bash, leadArgs: [sh], steamcmdDir: dir };
  }
  const raw = walkFindFile(dir, new Set(["steamcmd"]));
  if (raw) {
    try {
      fs.chmodSync(raw, 0o755);
    } catch {
      /* ignore */
    }
    return { command: raw, leadArgs: [], steamcmdDir: dir };
  }
  throw new Error(`SteamCMD not found under ${dir}`);
}

function tryExecFileOut(cmd: string, args: string[]): string | null {
  const candidates = [cmd, `/usr/bin/${cmd}`, `/bin/${cmd}`];
  for (const bin of candidates) {
    try {
      if (!fs.existsSync(bin)) {
        continue;
      }
      return execFileSync(bin, args, {
        encoding: "utf8",
        maxBuffer: 256_000,
      }).trim();
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Host-side diagnostics for support (posted to instance logs on provision).
 * Helps distinguish bash vs missing 32-bit dynamic linker for Valve's steamcmd binary.
 */
export function collectSteamCmdDiagnostics(launch: SteamCmdLaunch): string[] {
  const lines: string[] = [];
  const r = (msg: string) => lines.push(`[steamline] diag: ${msg}`);
  r(`node=${process.version} platform=${process.platform} arch=${process.arch}`);
  try {
    r(`uid=${process.getuid?.()} gid=${process.getgid?.()} euid=${process.geteuid?.()}`);
  } catch {
    r("uid=(unavailable)");
  }
  r(`spawn=${launch.command} leadArgs=${JSON.stringify(launch.leadArgs)}`);
  r(`steamcmdDir=${launch.steamcmdDir}`);
  r(`STEAMLINE_BASH_PATH=${process.env.STEAMLINE_BASH_PATH ?? "(unset)"}`);
  r(`PATH=${process.env.PATH ?? "(unset)"}`);

  const sh = walkFindFile(launch.steamcmdDir, new Set(["steamcmd.sh"]));
  const raw = walkFindFile(launch.steamcmdDir, new Set(["steamcmd"]));
  for (const [label, p] of [
    ["steamcmd.sh", sh],
    ["steamcmd", raw],
  ] as const) {
    if (!p) {
      r(`${label}: (not found under cache dir)`);
      continue;
    }
    try {
      const st = fs.statSync(p);
      r(`${label} path=${p} mode=${(st.mode & 0o777).toString(8)}`);
    } catch (e) {
      r(`${label} stat failed: ${e}`);
      continue;
    }
    const fileOut = tryExecFileOut("file", [p]);
    if (fileOut) {
      r(`file ${label}: ${fileOut.replace(/\s+/g, " ")}`);
    }
    if (label === "steamcmd") {
      const interp = readElfInterpreter(p);
      if (interp) {
        r(
          `PT_INTERP=${interp} exists=${fs.existsSync(interp)} (if false, install libc6-i386 on amd64)`
        );
      }
      const lddOut = tryExecFileOut("ldd", [p]);
      if (lddOut) {
        for (const line of lddOut.split("\n").slice(0, 48)) {
          if (line.trim()) {
            r(`ldd: ${line.trim()}`);
          }
        }
      } else {
        r("ldd: (not available or failed — install libc6-i386 on amd64 Debian/Ubuntu for 32-bit SteamCMD)");
      }
    }
  }

  if (process.platform === "linux") {
    const bashTry = [launch.command, "/bin/bash", "/usr/bin/bash"].filter(
      (p, i, a) => a.indexOf(p) === i
    );
    for (const b of bashTry) {
      if (!fs.existsSync(b)) {
        continue;
      }
      try {
        const ver = execFileSync(b, ["--version"], {
          encoding: "utf8",
          maxBuffer: 4096,
        }).trim();
        r(`bash ${b}: ${ver.split("\n")[0] ?? ver}`);
        break;
      } catch {
        /* try next */
      }
    }
  }

  return lines;
}

function readElfInterpreter(elfPath: string): string | null {
  for (const readelf of ["/usr/bin/readelf", "/bin/readelf"]) {
    if (!fs.existsSync(readelf)) {
      continue;
    }
    try {
      const out = execFileSync(readelf, ["-l", elfPath], {
        encoding: "utf8",
        maxBuffer: 512_000,
      });
      const m = /Requesting program interpreter:\s*([^\]\n]+)/.exec(out);
      const s = m?.[1]?.trim();
      return s && s.length > 0 ? s : null;
    } catch {
      continue;
    }
  }
  return null;
}

function isRootProcess(): boolean {
  try {
    return typeof process.getuid === "function" && process.getuid() === 0;
  } catch {
    return false;
  }
}

/**
 * Valve's steamcmd.sh runs linux32/steamcmd (32-bit). If PT_INTERP (e.g. /lib/ld-linux.so.2)
 * is missing, the shell reports: "cannot execute: required file not found" (often mistaken for bash).
 */
export function ensureLinuxSteamCmdLoader(steamcmdDir: string): void {
  if (process.platform !== "linux") {
    return;
  }
  if (process.arch !== "x64") {
    return;
  }

  const linux32 = path.join(steamcmdDir, "linux32", "steamcmd");
  if (!fs.existsSync(linux32)) {
    return;
  }

  const interp = readElfInterpreter(linux32);
  if (!interp) {
    console.error(
      "[steamline] could not read ELF interpreter for linux32/steamcmd (install binutils for readelf)"
    );
    return;
  }

  if (fs.existsSync(interp)) {
    return;
  }

  console.error(
    `[steamline] SteamCMD 32-bit binary needs "${interp}" — running dependency install…`
  );
  tryInstallLinuxDepsForSteamline();

  if (fs.existsSync(interp)) {
    return;
  }

  const alts = [
    "/lib/i386-linux-gnu/ld-linux.so.2",
    "/lib32/ld-linux.so.2",
  ];
  const found = alts.find((p) => fs.existsSync(p));
  if (found && isRootProcess()) {
    try {
      fs.mkdirSync(path.dirname(interp), { recursive: true });
      if (!fs.existsSync(interp)) {
        fs.symlinkSync(found, interp);
        console.error(`[steamline] symlinked ELF interpreter ${interp} -> ${found}`);
      }
    } catch (e) {
      console.error("[steamline] ELF interpreter symlink failed:", e);
    }
  }

  if (!fs.existsSync(interp)) {
    throw new Error(
      `SteamCMD cannot run: the 32-bit loader "${interp}" is missing. ` +
        `The script error "cannot execute: required file not found" refers to this file, not bash. ` +
        `As root: dpkg --add-architecture i386 2>/dev/null; apt-get update && apt-get install -y libc6-i386`
    );
  }
}

/**
 * Resolve SteamCMD binary — custom path, cache, or download Valve build.
 */
export async function ensureSteamCmd(): Promise<SteamCmdLaunch> {
  if (process.platform === "linux") {
    tryInstallLinuxDepsForSteamline();
  }

  if (process.env.STEAMLINE_STEAMCMD_PATH) {
    const p = process.env.STEAMLINE_STEAMCMD_PATH;
    if (!fs.existsSync(p)) {
      throw new Error(`STEAMLINE_STEAMCMD_PATH not found: ${p}`);
    }
    console.error(
      `[steamline] Using SteamCMD from STEAMLINE_STEAMCMD_PATH: ${p}`
    );
    const steamcmdDir = path.dirname(p);
    if (process.platform === "linux") {
      ensureLinuxSteamCmdLoader(steamcmdDir);
    }
    return {
      command: p,
      leadArgs: [],
      steamcmdDir,
    };
  }

  const root = cacheRoot();
  const marker = path.join(root, ".ready");
  if (fs.existsSync(marker)) {
    const dir = fs.readFileSync(marker, "utf8").trim();
    if (fs.existsSync(dir)) {
      console.error(
        `[steamline] Using cached SteamCMD at ${dir} (one copy per host; each server has its own game install directory).`
      );
      const launch = resolveLaunchFromDir(dir);
      if (process.platform === "linux") {
        ensureLinuxSteamCmdLoader(launch.steamcmdDir);
      }
      return launch;
    }
  }

  fs.mkdirSync(root, { recursive: true });

  if (process.platform === "win32") {
    const zip = path.join(root, "steamcmd.zip");
    const outDir = path.join(root, "extract");
    console.error("[steamline] downloading SteamCMD (Windows)…");
    await download(WIN_URL, zip);
    extractWin(zip, outDir);
    const launch = resolveLaunchFromDir(outDir);
    fs.writeFileSync(marker, outDir, "utf8");
    return launch;
  }

  const tgz = path.join(root, "steamcmd_linux.tar.gz");
  const outDir = path.join(root, "extract");
  console.error("[steamline] downloading SteamCMD (Linux)…");
  await download(LINUX_URL, tgz);
  extractLinux(tgz, outDir);
  const launch = resolveLaunchFromDir(outDir);
  fs.writeFileSync(marker, outDir, "utf8");
  if (process.platform === "linux") {
    ensureLinuxSteamCmdLoader(launch.steamcmdDir);
  }
  return launch;
}
