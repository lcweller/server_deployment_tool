/**
 * Gather CPU / memory / disk / network / GPU stats on the agent host (Node.js).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { detectHostingEnvironment } from "./environment-detect";
import type { HostingEnvironment } from "./environment-detect";

let dmidecodeInstallAttempted = false;

/** Previous sample for rate-based metrics */
let prevCpuInfo: os.CpuInfo[] | null = null;
let prevCpuSampleAt = 0;
let prevDiskSectors = new Map<string, { r: number; w: number }>();
let prevNetBytes = new Map<string, { rx: number; tx: number }>();
let prevRatesSampleAt = 0;

export type HeartbeatMetricsPayload = {
  hostname: string;
  platform: string;
  cpuModel: string;
  cpuCores: number;
  cpuPhysicalCores: number | null;
  cpuSockets: number | null;
  cpuLayoutSummary: string | null;
  cpuModelLines: string[];
  cpuTempCelsius: number | null;
  cpuPerCoreUsagePct: number[] | null;
  loadAvg1m: number;
  cpuEstimatePercent: number;
  memTotalBytes: number;
  memUsedBytes: number;
  memUsedPercent: number;
  memoryModuleCount: number | null;
  memoryModuleSummary: string | null;
  memoryModules: Array<{
    sizeBytes?: number | null;
    manufacturer?: string | null;
    partNumber?: string | null;
    speedMtS?: number | null;
    locator?: string | null;
  }>;
  diskPath: string;
  diskTotalBytes: number;
  diskUsedBytes: number;
  diskFreeBytes: number;
  diskUsedPercent: number;
  diskMounts: Array<{
    mountPoint: string;
    fstype?: string | null;
    device?: string | null;
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
    model?: string | null;
    readBps?: number | null;
    writeBps?: number | null;
  }>;
  networkInterfaces: Array<{
    name: string;
    mac?: string | null;
    ipv4?: string[];
    ipv6?: string[];
    linkSpeedMbps?: number | null;
    rxBps?: number | null;
    txBps?: number | null;
  }>;
  gpus: Array<{
    vendor: "nvidia" | "amd" | "intel" | "unknown";
    model: string;
    vramBytes?: number | null;
    tempC?: number | null;
    utilPercent?: number | null;
  }>;
  environment: HostingEnvironment;
  uptimeSeconds: number;
  osPrettyName: string | null;
  osVersionId: string | null;
  kernelVersion: string;
  publicIpv4?: string | null;
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

function linuxPhysicalCores(): number | null {
  if (process.platform !== "linux") {
    return null;
  }
  try {
    const text = fs.readFileSync("/proc/cpuinfo", "utf8");
    let max = 0;
    for (const line of text.split("\n")) {
      const m = /^cpu cores\s*:\s*(\d+)/i.exec(line.trim());
      if (m) {
        max = Math.max(max, Number(m[1]));
      }
    }
    return max > 0 ? max : null;
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

function parseDmidecodeType17(out: string): {
  count: number | null;
  summary: string | null;
} {
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
}

type MemoryModuleRow = {
  sizeBytes?: number | null;
  manufacturer?: string | null;
  partNumber?: string | null;
  speedMtS?: number | null;
  locator?: string | null;
};

function parseDmidecodeMemoryModulesDetailed(out: string): MemoryModuleRow[] {
  const rows: MemoryModuleRow[] = [];
  const blocks = out.split(/\r?\nMemory Device\r?\n/);
  for (let bi = 1; bi < blocks.length; bi++) {
    const block = blocks[bi]!;
    let sizeMb: number | null = null;
    let manufacturer: string | null = null;
    let partNumber: string | null = null;
    let speedMtS: number | null = null;
    let locator: string | null = null;
    for (const line of block.split("\n")) {
      const t = line.trim();
      if (/^Size:\s*No Module Installed/i.test(t)) {
        sizeMb = 0;
      }
      const gb = /^Size:\s*(\d+)\s*GB$/i.exec(t);
      const mb = /^Size:\s*(\d+)\s*MB$/i.exec(t);
      if (gb) {
        sizeMb = Number(gb[1]) * 1024;
      } else if (mb) {
        sizeMb = Number(mb[1]);
      }
      const man = /^Manufacturer:\s*(.+)$/i.exec(t);
      if (man) {
        manufacturer = man[1]!.trim();
      }
      const pn = /^Part Number:\s*(.+)$/i.exec(t);
      if (pn) {
        partNumber = pn[1]!.trim();
      }
      const sp = /^Speed:\s*(\d+)\s*MT\/s/i.exec(t);
      if (sp) {
        speedMtS = Number(sp[1]);
      }
      const loc = /^Locator:\s*(.+)$/i.exec(t);
      if (loc) {
        locator = loc[1]!.trim();
      }
    }
    if (sizeMb != null && sizeMb > 0) {
      rows.push({
        sizeBytes: sizeMb * 1024 * 1024,
        manufacturer,
        partNumber,
        speedMtS,
        locator,
      });
    }
  }
  return rows;
}

function tryDmidecodeType17(): string | null {
  const opts = {
    encoding: "utf8" as const,
    timeout: 12_000,
    maxBuffer: 4 * 1024 * 1024,
  };
  const attempts: string[][] = [
    ["dmidecode", "-t", "17"],
    ["/usr/sbin/dmidecode", "-t", "17"],
  ];
  const euid =
    typeof process.geteuid === "function" ? process.geteuid() : undefined;
  if (euid !== 0) {
    attempts.push(
      ["sudo", "-n", "dmidecode", "-t", "17"],
      ["sudo", "-n", "/usr/sbin/dmidecode", "-t", "17"]
    );
  }
  for (const argv of attempts) {
    try {
      return execFileSync(argv[0]!, argv.slice(1), opts);
    } catch {
      /* try next */
    }
  }
  return null;
}

function ensureDmidecodeInstalledIfRoot(): void {
  if (process.platform !== "linux") {
    return;
  }
  const euid =
    typeof process.geteuid === "function" ? process.geteuid() : undefined;
  if (euid !== 0) {
    return;
  }
  if (dmidecodeInstallAttempted) {
    return;
  }
  dmidecodeInstallAttempted = true;
  try {
    execFileSync("which", ["dmidecode"], { stdio: "ignore" });
    return;
  } catch {
    /* install */
  }
  try {
    if (fs.existsSync("/usr/bin/apt-get")) {
      execFileSync("/usr/bin/apt-get", ["install", "-y", "-qq", "dmidecode"], {
        stdio: "ignore",
        timeout: 180_000,
        env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" },
      });
    } else if (fs.existsSync("/usr/bin/dnf")) {
      execFileSync("/usr/bin/dnf", ["install", "-y", "-q", "dmidecode"], {
        stdio: "ignore",
        timeout: 180_000,
      });
    } else if (fs.existsSync("/sbin/apk")) {
      execFileSync("/sbin/apk", ["add", "--no-cache", "dmidecode"], {
        stdio: "ignore",
        timeout: 120_000,
      });
    }
  } catch {
    /* best-effort */
  }
}

function linuxMemoryModules(): {
  count: number | null;
  summary: string | null;
  modules: MemoryModuleRow[];
} {
  if (process.platform !== "linux") {
    return { count: null, summary: null, modules: [] };
  }
  ensureDmidecodeInstalledIfRoot();
  const out = tryDmidecodeType17();
  if (!out) {
    return { count: null, summary: null, modules: [] };
  }
  try {
    const basic = parseDmidecodeType17(out);
    const detailed = parseDmidecodeMemoryModulesDetailed(out);
    return {
      count: basic.count,
      summary: basic.summary,
      modules: detailed,
    };
  } catch {
    return { count: null, summary: null, modules: [] };
  }
}

function linuxCpuTempC(): number | null {
  if (process.platform !== "linux") {
    return null;
  }
  try {
    const zones = fs.readdirSync("/sys/class/thermal");
    let best = -Infinity;
    let any = -Infinity;
    for (const z of zones) {
      if (!z.startsWith("thermal_zone")) {
        continue;
      }
      const base = `/sys/class/thermal/${z}`;
      let type = "";
      try {
        type = fs.readFileSync(`${base}/type`, "utf8").trim();
      } catch {
        continue;
      }
      let raw: string;
      try {
        raw = fs.readFileSync(`${base}/temp`, "utf8");
      } catch {
        continue;
      }
      const m = Number.parseInt(raw.trim(), 10);
      if (!Number.isFinite(m)) {
        continue;
      }
      const c = m / 1000;
      any = Math.max(any, c);
      const tl = type.toLowerCase();
      if (
        tl.includes("cpu") ||
        tl.includes("core") ||
        tl.includes("k10temp") ||
        tl.includes("x86_pkg_temp") ||
        tl.includes("acpi")
      ) {
        best = Math.max(best, c);
      }
    }
    if (best > -Infinity) {
      return Math.round(best * 10) / 10;
    }
    if (any > -Infinity) {
      return Math.round(any * 10) / 10;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function computePerCoreUsage(
  prev: os.CpuInfo[] | null,
  curr: os.CpuInfo[],
  elapsedSec: number
): number[] | null {
  if (!prev || prev.length !== curr.length || elapsedSec <= 0) {
    return null;
  }
  const out: number[] = [];
  for (let i = 0; i < curr.length; i++) {
    const a = prev[i]!;
    const b = curr[i]!;
    const ta = a.times as Record<string, number>;
    const tb = b.times as Record<string, number>;
    const idleDelta = b.times.idle - a.times.idle;
    const irqDelta =
      (tb.irq ?? 0) -
      (ta.irq ?? 0) +
      ((tb.softirq ?? 0) - (ta.softirq ?? 0));
    const totalDelta =
      b.times.user -
      a.times.user +
      (b.times.nice - a.times.nice) +
      (b.times.sys - a.times.sys) +
      idleDelta +
      (tb.iowait ?? 0) -
      (ta.iowait ?? 0) +
      irqDelta;
    if (totalDelta <= 0) {
      out.push(0);
    } else {
      const used = totalDelta - idleDelta;
      out.push(Math.min(100, Math.max(0, Math.round((used / totalDelta) * 100))));
    }
  }
  return out;
}

const MOUNT_FSTYPES = new Set([
  "ext4",
  "xfs",
  "btrfs",
  "f2fs",
  "zfs",
  "vfat",
  "ntfs3",
  "fuseblk",
]);

function parentBlockName(dev: string): string | null {
  const b = dev.replace(/^\/dev\//, "");
  if (b.startsWith("dm-") || b.startsWith("loop")) {
    return b;
  }
  const nvme = b.match(/^(nvme\d+n\d+)p\d+$/);
  if (nvme) {
    return nvme[1]!;
  }
  const mmc = b.match(/^(mmcblk\d+)p\d+$/);
  if (mmc) {
    return mmc[1]!;
  }
  const sd = b.match(/^([sv]d[a-z]+)\d+$/i);
  if (sd) {
    return sd[1]!;
  }
  if (/^(sd[a-z]+|nvme\d+n\d+|mmcblk\d+|vd[a-z]+|hd[a-z]+)$/i.test(b)) {
    return b;
  }
  return null;
}

function diskModelForDevice(dev: string): string | null {
  if (process.platform !== "linux") {
    return null;
  }
  const blk = parentBlockName(dev);
  if (!blk) {
    return null;
  }
  try {
    const p = `/sys/block/${blk}/device/model`;
    const raw = fs.readFileSync(p, "utf8").trim();
    return raw.replace(/\s+/g, " ") || null;
  } catch {
    return null;
  }
}

function linuxDiskIoRates(): Map<string, { r: number; w: number }> {
  const m = new Map<string, { r: number; w: number }>();
  if (process.platform !== "linux") {
    return m;
  }
  try {
    const text = fs.readFileSync("/proc/diskstats", "utf8");
    for (const line of text.split("\n")) {
      const p = line.trim().split(/\s+/);
      if (p.length < 14) {
        continue;
      }
      const name = p[2];
      if (!name || name.startsWith("ram")) {
        continue;
      }
      const rsect = Number(p[5]);
      const wsect = Number(p[9]);
      if (!Number.isFinite(rsect) || !Number.isFinite(wsect)) {
        continue;
      }
      m.set(name, { r: rsect, w: wsect });
    }
  } catch {
    /* ignore */
  }
  return m;
}

function linuxNetDevBytes(): Map<string, { rx: number; tx: number }> {
  const m = new Map<string, { rx: number; tx: number }>();
  if (process.platform !== "linux") {
    return m;
  }
  try {
    const text = fs.readFileSync("/proc/net/dev", "utf8");
    const lines = text.split("\n").slice(2);
    for (const line of lines) {
      const idx = line.indexOf(":");
      if (idx === -1) {
        continue;
      }
      const name = line.slice(0, idx).trim();
      const rest = line.slice(idx + 1).trim().split(/\s+/);
      if (rest.length < 16) {
        continue;
      }
      const rx = Number(rest[0]);
      const tx = Number(rest[8]);
      if (!Number.isFinite(rx) || !Number.isFinite(tx)) {
        continue;
      }
      m.set(name, { rx, tx });
    }
  } catch {
    /* ignore */
  }
  return m;
}

function linkSpeedMbps(iface: string): number | null {
  if (process.platform !== "linux") {
    return null;
  }
  try {
    const raw = fs.readFileSync(
      `/sys/class/net/${iface}/speed`,
      "utf8"
    ).trim();
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      return null;
    }
    return n;
  } catch {
    return null;
  }
}

function collectLinuxMounts(
  diskIoNow: Map<string, { r: number; w: number }>,
  elapsedSec: number
): HeartbeatMetricsPayload["diskMounts"] {
  if (process.platform !== "linux") {
    return [];
  }
  const out: HeartbeatMetricsPayload["diskMounts"] = [];
  try {
    const text = fs.readFileSync("/proc/mounts", "utf8");
    const seen = new Set<string>();
    for (const line of text.split("\n")) {
      const parts = line.split(/\s+/);
      if (parts.length < 4) {
        continue;
      }
      const dev = parts[0]!;
      const mp = parts[1]!;
      const fst = parts[2]!;
      if (!mp.startsWith("/") || mp.startsWith("/snap")) {
        continue;
      }
      if (mp.includes("/docker") || mp.includes("containerd")) {
        continue;
      }
      if (!MOUNT_FSTYPES.has(fst)) {
        continue;
      }
      if (seen.has(mp)) {
        continue;
      }
      seen.add(mp);
      const st = diskForPath(mp);
      if (!st) {
        continue;
      }
      const blk = parentBlockName(dev);
      let readBps: number | null = null;
      let writeBps: number | null = null;
      if (blk && elapsedSec > 0.1) {
        const prev = prevDiskSectors.get(blk);
        const next = diskIoNow.get(blk);
        if (prev && next) {
          const dr = Math.max(0, next.r - prev.r) * 512;
          const dw = Math.max(0, next.w - prev.w) * 512;
          readBps = Math.round(dr / elapsedSec);
          writeBps = Math.round(dw / elapsedSec);
        }
      }
      out.push({
        mountPoint: mp,
        fstype: fst,
        device: dev,
        totalBytes: st.total,
        usedBytes: st.used,
        freeBytes: st.free,
        usedPercent: st.usedPercent,
        model: diskModelForDevice(dev),
        readBps,
        writeBps,
      });
      if (out.length >= 24) {
        break;
      }
    }
  } catch {
    /* ignore */
  }
  return out.sort((a, b) => a.mountPoint.localeCompare(b.mountPoint));
}

function collectNetworkInterfaces(
  netNow: Map<string, { rx: number; tx: number }>,
  elapsedSec: number
): HeartbeatMetricsPayload["networkInterfaces"] {
  const nics = os.networkInterfaces();
  const out: HeartbeatMetricsPayload["networkInterfaces"] = [];
  for (const [name, addrs] of Object.entries(nics)) {
    if (!addrs || name === "lo") {
      continue;
    }
    const ipv4: string[] = [];
    const ipv6: string[] = [];
    let mac: string | null = null;
    for (const a of addrs) {
      if (a.family === "IPv4") {
        ipv4.push(a.address);
      } else if (a.family === "IPv6") {
        ipv6.push(a.address);
      }
      if (a.mac && a.mac !== "00:00:00:00:00:00") {
        mac = a.mac;
      }
    }
    let rxBps: number | null = null;
    let txBps: number | null = null;
    if (elapsedSec > 0.1) {
      const prev = prevNetBytes.get(name);
      const next = netNow.get(name);
      if (prev && next) {
        rxBps = Math.round(Math.max(0, next.rx - prev.rx) / elapsedSec);
        txBps = Math.round(Math.max(0, next.tx - prev.tx) / elapsedSec);
      }
    }
    const speed =
      process.platform === "linux" ? linkSpeedMbps(name) : null;
    out.push({
      name,
      mac,
      ipv4: ipv4.length ? ipv4 : undefined,
      ipv6: ipv6.length ? ipv6 : undefined,
      linkSpeedMbps: speed,
      rxBps,
      txBps,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function tryNvidiaGpus(): HeartbeatMetricsPayload["gpus"] {
  const out: HeartbeatMetricsPayload["gpus"] = [];
  try {
    const csv = execFileSync(
      "nvidia-smi",
      [
        "--query-gpu=name,memory.total,temperature.gpu,utilization.gpu",
        "--format=csv,noheader,nounits",
      ],
      { encoding: "utf8", timeout: 5000, maxBuffer: 256 * 1024 }
    );
    for (const line of csv.split("\n")) {
      const p = line.split(",").map((s) => s.trim());
      if (p.length < 4) {
        continue;
      }
      const [model, vramMb, temp, util] = p;
      out.push({
        vendor: "nvidia",
        model: model || "NVIDIA GPU",
        vramBytes: vramMb ? Number(vramMb) * 1024 * 1024 : null,
        tempC: temp ? Number(temp) : null,
        utilPercent: util ? Number(util) : null,
      });
    }
  } catch {
    /* not installed or no driver */
  }
  return out;
}

function tryAmdGpuBasic(): HeartbeatMetricsPayload["gpus"] {
  if (process.platform !== "linux") {
    return [];
  }
  const out: HeartbeatMetricsPayload["gpus"] = [];
  try {
    const drm = "/sys/class/drm";
    const entries = fs.readdirSync(drm);
    for (const e of entries) {
      if (!e.startsWith("card") || e.includes("-")) {
        continue;
      }
      const vendorPath = path.join(drm, e, "device", "vendor");
      let vendorHex: string;
      try {
        vendorHex = fs.readFileSync(vendorPath, "utf8").trim();
      } catch {
        continue;
      }
      if (vendorHex !== "0x1002") {
        continue;
      }
      let model = "AMD GPU";
      const uevent = path.join(drm, e, "device", "uevent");
      try {
        const ue = fs.readFileSync(uevent, "utf8");
        const pci = /^PCI_ID=(.+)$/m.exec(ue);
        if (pci) {
          model = `AMD ${pci[1]}`;
        }
      } catch {
        /* ignore */
      }
      let tempC: number | null = null;
      const hwmonGlob = path.join(drm, e, "device", "hwmon");
      try {
        const hm = fs.readdirSync(hwmonGlob);
        for (const h of hm) {
          const t1 = path.join(hwmonGlob, h, "temp1_input");
          if (fs.existsSync(t1)) {
            const raw = fs.readFileSync(t1, "utf8").trim();
            const milli = Number(raw);
            if (Number.isFinite(milli)) {
              tempC = Math.round(milli / 1000);
            }
            break;
          }
        }
      } catch {
        /* ignore */
      }
      out.push({
        vendor: "amd",
        model,
        tempC,
        utilPercent: null,
        vramBytes: null,
      });
    }
  } catch {
    /* ignore */
  }
  return out;
}

function collectGpus(): HeartbeatMetricsPayload["gpus"] {
  const n = tryNvidiaGpus();
  if (n.length > 0) {
    return n;
  }
  const a = tryAmdGpuBasic();
  if (a.length > 0) {
    return a;
  }
  return [];
}

function readOsRelease(): { pretty: string | null; versionId: string | null } {
  if (process.platform === "linux") {
    try {
      const text = fs.readFileSync("/etc/os-release", "utf8");
      let pretty: string | null = null;
      let versionId: string | null = null;
      for (const line of text.split("\n")) {
        const pre = /^PRETTY_NAME="?([^"]+)"?$/.exec(line);
        if (pre) {
          pretty = pre[1]!.trim();
        }
        const vid = /^VERSION_ID="?([^"]+)"?$/.exec(line);
        if (vid) {
          versionId = vid[1]!.trim();
        }
      }
      return { pretty, versionId };
    } catch {
      /* ignore */
    }
  }
  return { pretty: null, versionId: null };
}

export function collectHeartbeatMetrics(): HeartbeatMetricsPayload {
  const cpus = os.cpus();
  const cpuCores = Math.max(1, cpus.length);
  const now = Date.now();
  const elapsedCpuMs = prevCpuSampleAt > 0 ? now - prevCpuSampleAt : 0;
  const perCore =
    prevCpuInfo && elapsedCpuMs > 200
      ? computePerCoreUsage(
          prevCpuInfo,
          cpus,
          Math.max(0.001, elapsedCpuMs / 1000)
        )
      : null;

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
  const phys = linuxPhysicalCores();
  const modelLines = distinctCpuModels(cpus);
  const layoutSummary =
    sockets != null
      ? `${sockets} socket(s) · ${cpuCores} logical core(s)${
          phys != null ? ` · ${phys} physical core(s)` : ""
        }`
      : `${cpuCores} logical core(s)${
          phys != null ? ` · ${phys} physical core(s)` : ""
        }`;

  const memMod = linuxMemoryModules();
  const cpuTemp = linuxCpuTempC();

  const diskIoNow = linuxDiskIoRates();
  const netNow = linuxNetDevBytes();
  const elapsedRatesSec =
    prevRatesSampleAt > 0 ? (now - prevRatesSampleAt) / 1000 : 0;

  const diskMounts = collectLinuxMounts(diskIoNow, elapsedRatesSec);
  const networkInterfaces = collectNetworkInterfaces(
    netNow,
    elapsedRatesSec
  );

  prevDiskSectors = diskIoNow;
  prevNetBytes = netNow;
  prevRatesSampleAt = now;
  prevCpuInfo = cpus;
  prevCpuSampleAt = now;

  const gpus = collectGpus();
  const env = detectHostingEnvironment();
  const osRel = readOsRelease();

  return {
    hostname: os.hostname(),
    platform: process.platform,
    cpuModel: (cpus[0]?.model ?? "unknown").trim(),
    cpuCores,
    cpuPhysicalCores: phys,
    cpuSockets: sockets,
    cpuLayoutSummary: layoutSummary,
    cpuModelLines: modelLines,
    cpuTempCelsius: cpuTemp,
    cpuPerCoreUsagePct: perCore,
    loadAvg1m,
    cpuEstimatePercent,
    memTotalBytes,
    memUsedBytes,
    memUsedPercent,
    memoryModuleCount: memMod.count,
    memoryModuleSummary: memMod.summary,
    memoryModules: memMod.modules,
    diskPath,
    diskTotalBytes: d?.total ?? 0,
    diskUsedBytes: d?.used ?? 0,
    diskFreeBytes: d?.free ?? 0,
    diskUsedPercent: d?.usedPercent ?? 0,
    diskMounts,
    networkInterfaces,
    gpus,
    environment: env,
    uptimeSeconds: Math.floor(os.uptime()),
    osPrettyName: osRel.pretty,
    osVersionId: osRel.versionId,
    kernelVersion: os.release(),
  };
}
