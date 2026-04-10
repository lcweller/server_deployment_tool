/**
 * Gather CPU / memory / disk stats on the agent host (Node.js).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type HeartbeatMetricsPayload = {
  hostname: string;
  platform: string;
  cpuModel: string;
  cpuCores: number;
  loadAvg1m: number;
  cpuEstimatePercent: number;
  memTotalBytes: number;
  memUsedBytes: number;
  memUsedPercent: number;
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

  return {
    hostname: os.hostname(),
    platform: process.platform,
    cpuModel: (cpus[0]?.model ?? "unknown").trim(),
    cpuCores,
    loadAvg1m,
    cpuEstimatePercent,
    memTotalBytes,
    memUsedBytes,
    memUsedPercent,
    diskPath,
    diskTotalBytes: d?.total ?? 0,
    diskUsedBytes: d?.used ?? 0,
    diskFreeBytes: d?.free ?? 0,
    diskUsedPercent: d?.usedPercent ?? 0,
  };
}
