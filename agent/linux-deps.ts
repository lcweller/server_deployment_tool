/**
 * Best-effort install of packages Steamline needs on minimal Linux (bash, tar, 32-bit libs for Valve SteamCMD).
 * Runs only when root (Debian/Ubuntu / Alpine apk). Otherwise logs a one-line hint.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";

function isRoot(): boolean {
  try {
    return typeof process.getuid === "function" && process.getuid() === 0;
  } catch {
    return false;
  }
}

function runApt(args: string[]): void {
  execFileSync("/usr/bin/apt-get", args, {
    stdio: "inherit",
    env: {
      ...process.env,
      DEBIAN_FRONTEND: "noninteractive",
    },
  });
}

function ensureI386IfDebian(): void {
  try {
    const archs = execFileSync("/usr/bin/dpkg", ["--print-foreign-architectures"], {
      encoding: "utf8",
    });
    if (!archs.includes("i386")) {
      execFileSync("/usr/bin/dpkg", ["--add-architecture", "i386"], {
        stdio: "inherit",
      });
    }
  } catch {
    /* non-Debian or dpkg missing */
  }
}

/**
 * Idempotent — safe to call before every SteamCMD run (no-ops quickly if already satisfied).
 */
export function tryInstallLinuxDepsForSteamline(): void {
  if (process.platform !== "linux") {
    return;
  }
  if (process.env.STEAMLINE_SKIP_AUTO_DEPS === "1") {
    return;
  }

  const apt = "/usr/bin/apt-get";
  const apk = "/sbin/apk";

  if (fs.existsSync(apt)) {
    if (!isRoot()) {
      console.error(
        "[steamline] Not running as root — skipping automatic apt. Use a root install (see install-agent.sh with sudo), or install bash, tar, and lib32gcc-s1 (i386) yourself."
      );
      return;
    }
    try {
      console.error(
        "[steamline] Ensuring OS packages for SteamCMD (apt — bash, tar, i386 libs)…"
      );
      runApt(["update", "-qq"]);
      runApt([
        "install",
        "-y",
        "-qq",
        "bash",
        "curl",
        "ca-certificates",
        "tar",
        "gzip",
        "libc6",
      ]);
      ensureI386IfDebian();
      runApt(["update", "-qq"]);
      try {
        runApt([
          "install",
          "-y",
          "-qq",
          "lib32gcc-s1",
          "libc6-i386",
          "lib32stdc++6",
        ]);
      } catch {
        try {
          runApt(["install", "-y", "-qq", "lib32gcc1", "libc6-i386"]);
        } catch {
          console.error(
            "[steamline] Could not install 32-bit SteamCMD deps (lib32gcc / libc6-i386) — SteamCMD may still fail on very minimal images."
          );
        }
      }
      try {
        runApt(["install", "-y", "-qq", "lib32z1"]);
      } catch {
        /* optional zlib for some titles */
      }
    } catch (e) {
      console.error("[steamline] apt auto-install failed (non-fatal):", e);
    }
    return;
  }

  if (fs.existsSync(apk) && isRoot()) {
    try {
      console.error(
        "[steamline] Ensuring OS packages for SteamCMD (apk — bash, tar, curl)…"
      );
      execFileSync(apk, ["add", "--no-cache", "bash", "tar", "curl", "ca-certificates"], {
        stdio: "inherit",
      });
    } catch (e) {
      console.error("[steamline] apk auto-install failed (non-fatal):", e);
    }
  }
}
