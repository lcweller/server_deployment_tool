"use client";

import { MetricsLoadingQuips } from "@/components/metrics-loading-quips";
import { UsageBar } from "@/components/usage-bar";
import { HOST_HEARTBEAT_MAX_AGE_MS } from "@/lib/host-presence";
import type { HostMetricsSnapshot } from "@/lib/host-metrics";
import {
  clampPct,
  formatBps,
  formatBytes,
} from "@/lib/host-metrics";
import { cn } from "@/lib/utils";
import {
  Activity,
  HardDrive,
  Microchip,
  MonitorSmartphone,
  Network,
} from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribeClock(onChange: () => void): () => void {
  const id = setInterval(onChange, 2000);
  return () => clearInterval(id);
}

function useClockMs(): number {
  return useSyncExternalStore(
    subscribeClock,
    () => Date.now(),
    () => 0
  );
}

type Props = {
  metrics: HostMetricsSnapshot | null | undefined;
  lastSeenAt: Date | null;
};

function hostingLabel(t: string): string {
  switch (t) {
    case "bare-metal":
      return "Bare metal";
    case "vm":
      return "Virtual machine";
    case "vps":
      return "Cloud / VPS";
    case "container":
      return "Container";
    default:
      return "Unknown";
  }
}

export function HostResourcesPanel({ metrics, lastSeenAt }: Props) {
  const nowMs = useClockMs();
  const live =
    lastSeenAt != null &&
    nowMs - lastSeenAt.getTime() < HOST_HEARTBEAT_MAX_AGE_MS;

  if (
    !metrics ||
    (metrics.memTotalBytes == null &&
      metrics.diskTotalBytes == null &&
      metrics.cpuCores == null)
  ) {
    return (
      <div className="space-y-4 rounded-xl border border-dashed border-border/80 bg-muted/10 p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Activity
            className="size-4 animate-pulse text-primary"
            aria-hidden
          />
          Gathering telemetry…
        </div>
        <MetricsLoadingQuips />
        <div className="space-y-3 opacity-50">
          <div className="h-2.5 w-full rounded-full bg-muted" />
          <div className="h-2.5 w-full rounded-full bg-muted" />
          <div className="h-2.5 w-full rounded-full bg-muted" />
        </div>
      </div>
    );
  }

  const cpuPct = clampPct(metrics.cpuEstimatePercent);
  const memPct = clampPct(metrics.memUsedPercent);
  const diskPct = clampPct(metrics.diskUsedPercent);

  const memDetail =
    metrics.memTotalBytes && metrics.memUsedBytes !== undefined
      ? `${formatBytes(metrics.memUsedBytes)} / ${formatBytes(metrics.memTotalBytes)}`
      : undefined;
  const diskDetail =
    metrics.diskTotalBytes && metrics.diskUsedBytes !== undefined
      ? `${formatBytes(metrics.diskUsedBytes)} used · ${formatBytes(metrics.diskFreeBytes ?? 0)} free`
      : undefined;

  const cpuHardware =
    metrics.cpuSockets != null ||
    metrics.cpuLayoutSummary ||
    (metrics.cpuModelLines && metrics.cpuModelLines.length > 0);

  const env = metrics.environment;

  return (
    <div
      className={cn(
        "space-y-5 rounded-xl border border-border/80 bg-card/40 p-6 shadow-sm",
        live && "ring-1 ring-primary/20"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Live telemetry
          </h3>
          <p className="text-xs text-muted-foreground">
            {metrics.hostname ? (
              <>
                <span className="font-medium text-foreground">
                  {metrics.hostname}
                </span>
                {metrics.platform ? ` · ${metrics.platform}` : ""}
              </>
            ) : (
              "Reported by agent"
            )}
            {metrics.osPrettyName ? (
              <span className="mt-1 block text-[11px] leading-snug text-muted-foreground/90">
                {metrics.osPrettyName}
                {metrics.kernelVersion ? ` · kernel ${metrics.kernelVersion}` : ""}
                {metrics.uptimeSeconds != null
                  ? ` · up ${formatUptime(metrics.uptimeSeconds)}`
                  : ""}
              </span>
            ) : metrics.kernelVersion ? (
              <span className="mt-1 block text-[11px] leading-snug text-muted-foreground/90">
                Kernel {metrics.kernelVersion}
                {metrics.uptimeSeconds != null
                  ? ` · up ${formatUptime(metrics.uptimeSeconds)}`
                  : ""}
              </span>
            ) : null}
            {metrics.cpuModel ? (
              <span className="mt-1 block text-[11px] leading-snug text-muted-foreground/90">
                {metrics.cpuModel}
              </span>
            ) : null}
            {metrics.publicIpv4 ? (
              <span className="mt-1 block font-mono text-[11px] text-foreground/90">
                Public IPv4: {metrics.publicIpv4}
              </span>
            ) : null}
          </p>
        </div>
        {live ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/40 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            Live
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Last metrics{" "}
            {metrics.receivedAt
              ? new Date(metrics.receivedAt).toLocaleTimeString(undefined, {
                  timeStyle: "short",
                })
              : "—"}
          </span>
        )}
      </div>

      {env ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <MonitorSmartphone className="size-3.5 opacity-70" aria-hidden />
            Environment
          </p>
          <p className="mt-1">
            <span className="text-foreground">
              {hostingLabel(env.hostingType)}
            </span>
            {env.provider ? (
              <>
                {" "}
                · <span className="text-foreground">{env.provider}</span>
              </>
            ) : null}
            {env.hypervisor ? (
              <>
                {" "}
                · {env.hypervisor}
              </>
            ) : null}
          </p>
          {env.virtualizationDetail ? (
            <p className="mt-0.5 text-[10px] text-foreground/80">{env.virtualizationDetail}</p>
          ) : null}
          {env.systemManufacturer || env.systemProductName ? (
            <p className="mt-0.5 font-mono text-[10px] text-foreground/80">
              {[env.systemManufacturer, env.systemProductName]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {metrics.gpus === undefined ? null : metrics.gpus.length > 0 ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px]">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <Microchip className="size-3.5 opacity-70" aria-hidden />
            GPU
          </p>
          <ul className="mt-1 space-y-1.5">
            {metrics.gpus.map((g, i) => (
              <li key={`${g.model}-${i}`} className="text-muted-foreground">
                <span className="font-medium text-foreground">{g.model}</span>
                {g.vendor ? ` (${g.vendor})` : ""}
                {g.vramBytes ? ` · ${formatBytes(g.vramBytes)} VRAM` : ""}
                {g.tempC != null ? ` · ${g.tempC}°C` : ""}
                {g.utilPercent != null ? ` · ${g.utilPercent}% util` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/50 bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
          No discrete GPU detected (integrated graphics may not appear here).
        </div>
      )}

      {cpuHardware ||
      metrics.cpuPhysicalCores != null ||
      metrics.cpuTempCelsius != null ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">CPU layout</p>
          {metrics.cpuLayoutSummary ? (
            <p className="mt-0.5">{metrics.cpuLayoutSummary}</p>
          ) : null}
          {metrics.cpuSockets != null ? (
            <p className="mt-0.5">
              Packages (sockets):{" "}
              <span className="font-mono text-foreground">
                {metrics.cpuSockets}
              </span>
            </p>
          ) : null}
          {metrics.cpuModelLines && metrics.cpuModelLines.length > 0 ? (
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {metrics.cpuModelLines.map((line) => (
                <li
                  key={line}
                  className="font-mono text-[10px] text-foreground/90"
                >
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
          {metrics.cpuTempCelsius != null ? (
            <p className="mt-1">
              Package / CPU temp:{" "}
              <span className="font-mono text-foreground">
                {metrics.cpuTempCelsius}°C
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {metrics.cpuPerCoreUsagePct && metrics.cpuPerCoreUsagePct.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-foreground">
            Per-core usage
          </p>
          <div className="flex flex-wrap gap-1.5">
            {metrics.cpuPerCoreUsagePct.map((p, i) => (
              <span
                key={i}
                className="inline-flex min-w-[2.5rem] flex-col items-center rounded border border-border/60 bg-muted/30 px-1.5 py-1 text-[10px]"
                title={`Core ${i}`}
              >
                <span className="text-muted-foreground">{i}</span>
                <span className="font-mono text-foreground">{p}%</span>
              </span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            From CPU time deltas between agent heartbeats (first sample may be
            empty).
          </p>
        </div>
      ) : null}

      {(metrics.memoryModuleCount != null ||
        metrics.memoryModuleSummary ||
        metrics.memTotalBytes ||
        (metrics.memoryModules && metrics.memoryModules.length > 0)) ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">Memory</p>
          {metrics.memTotalBytes ? (
            <p className="mt-0.5">
              Total capacity:{" "}
              <span className="font-mono text-foreground">
                {formatBytes(metrics.memTotalBytes)}
              </span>
            </p>
          ) : null}
          {metrics.memoryModuleCount != null ? (
            <p className="mt-0.5">
              Modules reported:{" "}
              <span className="font-mono text-foreground">
                {metrics.memoryModuleCount}
              </span>
              {metrics.memoryModuleSummary ? (
                <span className="block pt-0.5 text-[10px] leading-snug">
                  {metrics.memoryModuleSummary}
                </span>
              ) : null}
            </p>
          ) : metrics.memoryModuleSummary ? (
            <p className="mt-0.5">{metrics.memoryModuleSummary}</p>
          ) : metrics.platform === "linux" ? (
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
              Per-DIMM details use{" "}
              <code className="rounded bg-muted px-0.5">dmidecode</code> — run
              the agent as root (recommended in the install script) or ensure{" "}
              <code className="rounded bg-muted px-0.5">sudo -n dmidecode</code>{" "}
              works.
            </p>
          ) : (
            <p className="mt-0.5 text-[10px] italic text-muted-foreground">
              Per-module memory details are only collected on Linux.
            </p>
          )}
          {metrics.memoryModules && metrics.memoryModules.length > 0 ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[320px] border-collapse text-left text-[10px]">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">Slot</th>
                    <th className="py-1 pr-2 font-medium">Size</th>
                    <th className="py-1 pr-2 font-medium">Manufacturer</th>
                    <th className="py-1 pr-2 font-medium">Part #</th>
                    <th className="py-1 font-medium">Speed</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.memoryModules.map((mod, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-border/40 text-foreground/90"
                    >
                      <td className="py-1 pr-2 font-mono">
                        {mod.locator ?? "—"}
                      </td>
                      <td className="py-1 pr-2 font-mono">
                        {mod.sizeBytes
                          ? formatBytes(mod.sizeBytes)
                          : "—"}
                      </td>
                      <td className="py-1 pr-2">{mod.manufacturer ?? "—"}</td>
                      <td className="py-1 pr-2 font-mono text-[9px]">
                        {mod.partNumber ?? "—"}
                      </td>
                      <td className="py-1">
                        {mod.speedMtS != null ? `${mod.speedMtS} MT/s` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {metrics.diskMounts && metrics.diskMounts.length > 0 ? (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
            <HardDrive className="size-3.5 opacity-70" aria-hidden />
            Storage mounts
          </p>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full min-w-[480px] border-collapse text-left text-[10px]">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30 text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium">Mount</th>
                  <th className="px-2 py-1.5 font-medium">Use</th>
                  <th className="px-2 py-1.5 font-medium">Model</th>
                  <th className="px-2 py-1.5 font-medium">Read</th>
                  <th className="px-2 py-1.5 font-medium">Write</th>
                </tr>
              </thead>
              <tbody>
                {metrics.diskMounts.map((dm) => (
                  <tr
                    key={dm.mountPoint}
                    className="border-b border-border/40 text-foreground/90"
                  >
                    <td className="px-2 py-1.5 align-top font-mono text-[9px]">
                      {dm.mountPoint}
                      {dm.fstype ? (
                        <span className="block text-muted-foreground">
                          {dm.fstype}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      {dm.usedPercent}%
                      <span className="block text-muted-foreground">
                        {formatBytes(dm.usedBytes)} / {formatBytes(dm.totalBytes)}
                      </span>
                    </td>
                    <td className="max-w-[140px] truncate px-2 py-1.5 align-top text-[9px]">
                      {dm.model ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 align-top font-mono">
                      {formatBps(dm.readBps ?? null)}
                    </td>
                    <td className="px-2 py-1.5 align-top font-mono">
                      {formatBps(dm.writeBps ?? null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {metrics.networkInterfaces && metrics.networkInterfaces.length > 0 ? (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
            <Network className="size-3.5 opacity-70" aria-hidden />
            Network interfaces
          </p>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full min-w-[480px] border-collapse text-left text-[10px]">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30 text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium">Iface</th>
                  <th className="px-2 py-1.5 font-medium">IPv4</th>
                  <th className="px-2 py-1.5 font-medium">Link</th>
                  <th className="px-2 py-1.5 font-medium">RX</th>
                  <th className="px-2 py-1.5 font-medium">TX</th>
                </tr>
              </thead>
              <tbody>
                {metrics.networkInterfaces.map((ni) => (
                  <tr
                    key={ni.name}
                    className="border-b border-border/40 text-foreground/90"
                  >
                    <td className="px-2 py-1.5 align-top font-mono">
                      {ni.name}
                      {ni.mac ? (
                        <span className="block text-[9px] text-muted-foreground">
                          {ni.mac}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5 align-top font-mono text-[9px]">
                      {ni.ipv4?.join(", ") ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 align-top">
                      {ni.linkSpeedMbps != null && ni.linkSpeedMbps > 0
                        ? `${ni.linkSpeedMbps} Mbps`
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5 align-top font-mono">
                      {formatBps(ni.rxBps ?? null)}
                    </td>
                    <td className="px-2 py-1.5 align-top font-mono">
                      {formatBps(ni.txBps ?? null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <UsageBar
        label="CPU load (estimate)"
        percent={cpuPct}
        detail={
          metrics.cpuCores
            ? `${metrics.loadAvg1m?.toFixed(2) ?? "—"} load · ${metrics.cpuCores} logical cores`
            : undefined
        }
        pulse={live}
      />
      <UsageBar
        label="Memory"
        percent={memPct}
        detail={memDetail}
        pulse={live}
      />
      <UsageBar
        label={`Disk (${metrics.diskPath ?? "/"})`}
        percent={diskPct}
        detail={diskDetail}
        pulse={live}
      />
    </div>
  );
}

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) {
    return `${d}d ${h}h`;
  }
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}
