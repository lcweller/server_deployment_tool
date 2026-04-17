/**
 * Host resource snapshot (agent → heartbeat → DB → UI).
 */
export type HostEnvironmentSnapshot = {
  hostingType: "bare-metal" | "vm" | "vps" | "container" | "unknown";
  hypervisor?: string | null;
  provider?: string | null;
  virtualizationDetail?: string | null;
  systemManufacturer?: string | null;
  systemProductName?: string | null;
};

export type MemoryModuleDetail = {
  /** Capacity in bytes when known */
  sizeBytes?: number | null;
  manufacturer?: string | null;
  partNumber?: string | null;
  /** MT/s when known */
  speedMtS?: number | null;
  /** DIMM slot locator e.g. "DIMM_A1" */
  locator?: string | null;
};

export type DiskMountSnapshot = {
  mountPoint: string;
  fstype?: string | null;
  device?: string | null;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
  /** e.g. rotating disk model */
  model?: string | null;
  readBps?: number | null;
  writeBps?: number | null;
};

export type NetworkInterfaceSnapshot = {
  name: string;
  mac?: string | null;
  ipv4?: string[];
  ipv6?: string[];
  /** -1 or null if unknown (virtual iface) */
  linkSpeedMbps?: number | null;
  rxBps?: number | null;
  txBps?: number | null;
};

export type GpuSnapshot = {
  vendor: "nvidia" | "amd" | "intel" | "unknown";
  model: string;
  vramBytes?: number | null;
  tempC?: number | null;
  utilPercent?: number | null;
};

export type HostMetricsSnapshot = {
  hostname?: string;
  platform?: string;
  cpuModel?: string;
  cpuCores?: number;
  /** Physical cores (Linux /proc/cpuinfo) when known */
  cpuPhysicalCores?: number | null;
  /** CPU packages / sockets when the agent could detect them */
  cpuSockets?: number | null;
  cpuLayoutSummary?: string | null;
  /** Distinct models with counts, e.g. ["2× AMD Ryzen …"] */
  cpuModelLines?: string[];
  /** Package or hottest CPU thermal zone (°C) */
  cpuTempCelsius?: number | null;
  /** Per-core utilization 0–100 (same order as os.cpus()) */
  cpuPerCoreUsagePct?: number[];
  loadAvg1m?: number;
  /** 0–100 rough utilization from load average ÷ cores */
  cpuEstimatePercent?: number;
  memTotalBytes?: number;
  memUsedBytes?: number;
  memUsedPercent?: number;
  memoryModuleCount?: number | null;
  memoryModuleSummary?: string | null;
  memoryModules?: MemoryModuleDetail[];
  diskPath?: string;
  diskTotalBytes?: number;
  diskUsedBytes?: number;
  diskFreeBytes?: number;
  diskUsedPercent?: number;
  /** All interesting mounts (Linux) */
  diskMounts?: DiskMountSnapshot[];
  /** Best-effort public IPv4 reported by the agent (WAN). */
  publicIpv4?: string | null;
  networkInterfaces?: NetworkInterfaceSnapshot[];
  gpus?: GpuSnapshot[];
  environment?: HostEnvironmentSnapshot;
  uptimeSeconds?: number;
  osPrettyName?: string | null;
  osVersionId?: string | null;
  kernelVersion?: string;
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

/** Throughput (bytes/sec) for network/disk I/O */
export function formatBps(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) {
    return "—";
  }
  if (n < 1024) {
    return `${Math.round(n)} B/s`;
  }
  return `${formatBytes(n)}/s`;
}
