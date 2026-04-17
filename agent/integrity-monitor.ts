import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

type Baseline = Record<string, string>;

const CRITICAL_FILES = [
  "/etc/sysctl.d/99-gameserveros-hardening.conf",
  "/etc/apparmor.d/steamline-agent",
  "/etc/apparmor.d/steamline-gameserver",
];

function baselinePath(): string {
  const root = process.env.STEAMLINE_DATA_ROOT ?? path.join(process.cwd(), "steamline-data");
  return path.join(root, "integrity-baseline.json");
}

function sha256File(filePath: string): string {
  const b = readFileSync(filePath);
  return createHash("sha256").update(b).digest("hex");
}

function collectCurrent(): Baseline {
  const out: Baseline = {};
  for (const fp of CRITICAL_FILES) {
    if (!existsSync(fp)) {
      continue;
    }
    out[fp] = sha256File(fp);
  }
  return out;
}

export function runIntegrityMonitorOnce(): string[] {
  const logs: string[] = [];
  if (process.platform !== "linux") {
    return logs;
  }
  const fp = baselinePath();
  const current = collectCurrent();
  if (!existsSync(fp)) {
    writeFileSync(fp, JSON.stringify(current, null, 2) + "\n", "utf8");
    logs.push("[steamline] integrity baseline initialized.");
    return logs;
  }
  let baseline: Baseline = {};
  try {
    baseline = JSON.parse(readFileSync(fp, "utf8")) as Baseline;
  } catch {
    baseline = {};
  }
  const drifted = Object.keys(current).filter((k) => baseline[k] !== current[k]);
  if (drifted.length > 0) {
    logs.push(`[steamline] integrity drift detected: ${drifted.join(", ")}`);
    writeFileSync(fp, JSON.stringify(current, null, 2) + "\n", "utf8");
  }
  return logs;
}

