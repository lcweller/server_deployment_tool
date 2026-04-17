import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";

const SYSCTL_DST = "/etc/sysctl.d/99-gameserveros-hardening.conf";
const APPARMOR_DST = "/etc/apparmor.d";

function isLinuxRoot(): boolean {
  return (
    process.platform === "linux" &&
    typeof process.getuid === "function" &&
    process.getuid() === 0
  );
}

function repoRoot(): string {
  return path.join(__dirname, "..");
}

function hasCmd(name: string): boolean {
  const r = spawnSync("sh", ["-c", `command -v ${name}`], {
    encoding: "utf8",
    windowsHide: true,
  });
  return r.status === 0;
}

export function applyLinuxHardeningOnce(): string[] {
  const logs: string[] = [];
  if (!isLinuxRoot()) {
    return logs;
  }

  const sysctlSrc = path.join(
    repoRoot(),
    "config",
    "sysctl",
    "99-gameserveros-hardening.conf"
  );
  if (existsSync(sysctlSrc)) {
    try {
      copyFileSync(sysctlSrc, SYSCTL_DST);
      chmodSync(SYSCTL_DST, 0o644);
      execFileSync("sysctl", ["--system"], { stdio: "pipe" });
      logs.push("[steamline] Applied Linux hardening sysctl profile.");
    } catch (e) {
      logs.push(
        `[steamline] sysctl hardening apply failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  if (hasCmd("apparmor_parser")) {
    const srcDir = path.join(repoRoot(), "config", "apparmor");
    if (existsSync(srcDir)) {
      try {
        mkdirSync(APPARMOR_DST, { recursive: true });
        for (const file of readdirSync(srcDir)) {
          const src = path.join(srcDir, file);
          const dst = path.join(APPARMOR_DST, file);
          copyFileSync(src, dst);
          chmodSync(dst, 0o644);
          execFileSync("apparmor_parser", ["-r", dst], { stdio: "pipe" });
        }
        logs.push("[steamline] AppArmor profiles loaded.");
      } catch (e) {
        logs.push(
          `[steamline] AppArmor profile load failed: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  } else {
    logs.push("[steamline] AppArmor not available on this host; skipping.");
  }

  // IPv6 is intentionally disabled for the appliance profile.
  const ipv6Cfg = "/etc/sysctl.d/99-gameserveros-ipv6-disable.conf";
  try {
    writeFileSync(
      ipv6Cfg,
      "net.ipv6.conf.all.disable_ipv6 = 1\nnet.ipv6.conf.default.disable_ipv6 = 1\n",
      "utf8"
    );
    chmodSync(ipv6Cfg, 0o644);
    execFileSync("sysctl", ["--system"], { stdio: "pipe" });
    logs.push("[steamline] IPv6 disabled via sysctl profile.");
  } catch (e) {
    logs.push(
      `[steamline] IPv6 hard-disable apply failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  return logs;
}

