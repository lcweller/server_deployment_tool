/**
 * Best-effort install of packages Steamline needs on minimal Linux (bash, tar, 32-bit loader + libs for Valve SteamCMD).
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

function tryAptInstallOne(pkg: string, quiet: boolean): boolean {
  try {
    if (quiet) {
      runApt(["install", "-y", "-qq", pkg]);
    } else {
      runApt(["install", "-y", pkg]);
    }
    return true;
  } catch {
    return false;
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
        "[steamline] Not running as root — skipping automatic apt. Use sudo for the install script, or install libc6-i386 so /lib/ld-linux.so.2 exists for 32-bit SteamCMD."
      );
      return;
    }
    try {
      console.error(
        "[steamline] Ensuring OS packages for SteamCMD (apt — libc6-i386 is installed in its own step)…"
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
        "binutils",
      ]);
      ensureI386IfDebian();
      runApt(["update", "-qq"]);

      // Critical: 32-bit dynamic linker for Valve linux32/steamcmd — separate from lib32gcc so one failure cannot skip this.
      console.error("[steamline] apt: installing libc6-i386 (32-bit ELF loader for SteamCMD)…");
      if (!tryAptInstallOne("libc6-i386", false)) {
        console.error(
          "[steamline] libc6-i386 failed — trying multiarch libc6:i386 …"
        );
        tryAptInstallOne("libc6:i386", false);
      }

      for (const pkg of ["lib32gcc-s1", "lib32stdc++6", "lib32z1"]) {
        tryAptInstallOne(pkg, true);
      }
      tryAptInstallOne("lib32gcc1", true);
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
