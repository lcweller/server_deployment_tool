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
          Waiting for host metrics…
        </div>
        <p className="text-xs text-muted-foreground">
          The one-line installer normally starts the agent in the background. If
          this host was enrolled but the process is not running, SSH once and run:{" "}
          <code className="rounded bg-muted px-1">
            cd ~/.steamline && nohup node steamline-agent.cjs run
            &lt;dashboard-url&gt; &gt;&gt; agent.log 2&gt;&amp;1 &amp;
          </code>
          . Metrics appear after the first successful heartbeat.
        </p>
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

      <UsageBar
        label="CPU load (estimate)"
        percent={cpuPct}
        detail={
          metrics.cpuCores
            ? `${metrics.loadAvg1m?.toFixed(2) ?? "—"} load · ${metrics.cpuCores} cores`
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
