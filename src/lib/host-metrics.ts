/**
 * Host resource snapshot (agent → heartbeat → DB → UI).
 */
export type HostMetricsSnapshot = {
  hostname?: string;
  platform?: string;
  cpuModel?: string;
  cpuCores?: number;
  /** CPU packages / sockets when the agent could detect them */
  cpuSockets?: number | null;
  cpuLayoutSummary?: string | null;
  /** Distinct models with counts, e.g. ["2× AMD Ryzen …"] */
  cpuModelLines?: string[];
  loadAvg1m?: number;
  /** 0–100 rough utilization from load average ÷ cores */
  cpuEstimatePercent?: number;
  memTotalBytes?: number;
  memUsedBytes?: number;
  memUsedPercent?: number;
  memoryModuleCount?: number | null;
  memoryModuleSummary?: string | null;
  diskPath?: string;
  diskTotalBytes?: number;
  diskUsedBytes?: number;
  diskFreeBytes?: number;
  diskUsedPercent?: number;
  /** Set by the control plane when persisting */
  receivedAt?: string;
};

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return "—";
  }
  if (n < 1024) {
    return `${Math.round(n)} B`;
  }
  const u = ["KB", "MB", "GB", "TB"] as const;
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i += 1;
  } while (v >= 1024 && i < u.length - 1);
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}

export function clampPct(n: number | undefined): number {
  if (n == null || !Number.isFinite(n)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(n)));
}
