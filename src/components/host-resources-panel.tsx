import { MetricsLoadingQuips } from "@/components/metrics-loading-quips";
import { UsageBar } from "@/components/usage-bar";
import type { HostMetricsSnapshot } from "@/lib/host-metrics";
import { clampPct, formatBytes } from "@/lib/host-metrics";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

type Props = {
  metrics: HostMetricsSnapshot | null | undefined;
  lastSeenAt: Date | null;
};

export function HostResourcesPanel({ metrics, lastSeenAt }: Props) {
  const live =
    lastSeenAt != null &&
    Date.now() - lastSeenAt.getTime() < 2 * 60 * 1000;

  if (!metrics || (!metrics.memTotalBytes && !metrics.diskTotalBytes)) {
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
            Live resources
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

      {cpuHardware ? (
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
                <li key={line} className="font-mono text-[10px] text-foreground/90">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {(metrics.memoryModuleCount != null ||
        metrics.memoryModuleSummary ||
        metrics.memTotalBytes) ? (
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
          ) : (
            <p className="mt-0.5 text-[10px] italic">
              DIMM details need root on Linux (
              <code className="rounded bg-muted px-0.5">dmidecode</code>
              ).
            </p>
          )}
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
