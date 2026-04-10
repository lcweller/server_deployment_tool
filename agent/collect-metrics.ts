/**
 * Gather CPU / memory / disk stats on the agent host (Node.js).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type HeartbeatMetricsPayload = {
  hostname: string;
  platform: string;
  cpuModel: string;
  cpuCores: number;
  /** Distinct CPU packages/sockets when detectable (often 1 on VMs). */
  cpuSockets: number | null;
  /** Human summary, e.g. "2 sockets · 16 logical cores" */
  cpuLayoutSummary: string | null;
  /** One line per distinct processor model (deduped). */
  cpuModelLines: string[];
  loadAvg1m: number;
  cpuEstimatePercent: number;
  memTotalBytes: number;
  memUsedBytes: number;
  memUsedPercent: number;
  /** Populated DIMM count when dmidecode works (often needs root). */
  memoryModuleCount: number | null;
  /** Short note e.g. "4× 16 GB (reported)" */
  memoryModuleSummary: string | null;
  diskPath: string;
  diskTotalBytes: number;
  diskUsedBytes: number;
  diskFreeBytes: number;
  diskUsedPercent: number;
};

function diskForPath(mountPath: string): {
  total: number;
  used: number;
  free: number;
  usedPercent: number;
} | null {
  try {
    const s = fs.statfsSync(mountPath);
    const bs = Number(s.bsize);
    const blocks = Number(s.blocks);
    const bavail = Number(s.bavail);
    if (!bs || !blocks) {
      return null;
    }
    const total = blocks * bs;
    const free = bavail * bs;
    const used = Math.max(0, total - free);
    const usedPercent =
      total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    return { total, used, free, usedPercent };
  } catch {
    return null;
  }
}

function linuxCpuSockets(): number | null {
  if (process.platform !== "linux") {
    return null;
  }
  try {
    const text = fs.readFileSync("/proc/cpuinfo", "utf8");
    const ids = new Set<string>();
    for (const line of text.split("\n")) {
      const m = /^physical id\s*:\s*(\d+)/.exec(line);
      if (m) {
        ids.add(m[1]!);
      }
    }
    if (ids.size > 0) {
      return ids.size;
    }
    return 1;
  } catch {
    return null;
  }
}

function distinctCpuModels(cpus: os.CpuInfo[]): string[] {
  const seen = new Map<string, number>();
  for (const c of cpus) {
    const m = (c.model ?? "unknown").trim();
    seen.set(m, (seen.get(m) ?? 0) + 1);
  }
  return [...seen.entries()].map(([model, n]) =>
    n > 1 ? `${n}× ${model}` : model
  );
}

/**
 * Best-effort DIMM inventory via dmidecode (may require root).
 */
function linuxMemoryModules(): {
  count: number | null;
  summary: string | null;
} {
  if (process.platform !== "linux") {
    return { count: null, summary: null };
  }
  try {
    const out = execFileSync("dmidecode", ["-t", "17"], {
      encoding: "utf8",
      timeout: 12_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const sizesMb: number[] = [];
    for (const line of out.split("\n")) {
      const t = line.trim();
      if (/^Size:\s*No Module Installed/i.test(t)) {
        continue;
      }
      const gb = /^Size:\s*(\d+)\s*GB$/i.exec(t);
      const mb = /^Size:\s*(\d+)\s*MB$/i.exec(t);
      if (gb) {
        sizesMb.push(Number(gb[1]) * 1024);
      } else if (mb) {
        sizesMb.push(Number(mb[1]));
      }
    }
    if (sizesMb.length === 0) {
      return { count: null, summary: null };
    }
    const fmt = (n: number) =>
      n >= 1024 ? `${Math.round(n / 1024)} GB` : `${n} MB`;
    return {
      count: sizesMb.length,
      summary: `${sizesMb.length} stick(s): ${sizesMb.map(fmt).join(", ")}`,
    };
  } catch {
    return { count: null, summary: null };
  }
}

export function collectHeartbeatMetrics(): HeartbeatMetricsPayload {
  const cpus = os.cpus();
  const cpuCores = Math.max(1, cpus.length);
  const loadAvg1m = os.loadavg()[0] ?? 0;
  const cpuEstimatePercent = Math.min(
    100,
    Math.round((loadAvg1m / cpuCores) * 100)
  );

  const memTotalBytes = os.totalmem();
  const memFreeBytes = os.freemem();
  const memUsedBytes = Math.max(0, memTotalBytes - memFreeBytes);
  const memUsedPercent =
    memTotalBytes > 0
      ? Math.min(100, Math.round((memUsedBytes / memTotalBytes) * 100))
      : 0;

  const diskPath =
    process.platform === "win32" ? path.parse(process.cwd()).root || "C:\\" : "/";
  const d = diskForPath(diskPath);

  const sockets = linuxCpuSockets();
  const modelLines = distinctCpuModels(cpus);
  const layoutSummary =
    sockets != null
      ? `${sockets} socket(s) · ${cpuCores} logical core(s)`
      : `${cpuCores} logical core(s)`;

  const memMod = linuxMemoryModules();

  return {
    hostname: os.hostname(),
    platform: process.platform,
    cpuModel: (cpus[0]?.model ?? "unknown").trim(),
    cpuCores,
    cpuSockets: sockets,
    cpuLayoutSummary: layoutSummary,
    cpuModelLines: modelLines,
    loadAvg1m,
    cpuEstimatePercent,
    memTotalBytes,
    memUsedBytes,
    memUsedPercent,
    memoryModuleCount: memMod.count,
    memoryModuleSummary: memMod.summary,
    diskPath,
    diskTotalBytes: d?.total ?? 0,
    diskUsedBytes: d?.used ?? 0,
    diskFreeBytes: d?.free ?? 0,
    diskUsedPercent: d?.usedPercent ?? 0,
  };
}
