"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DeploymentPlaybook } from "@/components/deployment-playbook";
import type { AllocatedPorts } from "@/lib/allocated-ports";
import type { HostMetricsSnapshot } from "@/lib/host-metrics";
import type { LogInsights } from "@/lib/log-insights";
import { instanceDashboardStatusLabel } from "@/lib/instance-status-label";
import { useHostRealtimeEvents } from "@/lib/realtime/use-host-realtime-events";
import { cn } from "@/lib/utils";

type InstancePayload = {
  id: string;
  name: string;
  status: string;
  provisionMessage: string | null;
  lastError: string | null;
  updatedAt: string;
  catalogName: string | null;
  hostName: string | null;
  allocatedPorts?: AllocatedPorts | null;
  hostMetrics?: HostMetricsSnapshot | null;
  logInsights?: LogInsights;
  /** False when the assigned host has no recent agent heartbeat. */
  hostReachable?: boolean;
};

type Props = {
  instanceId: string;
  initial: InstancePayload;
};

const ACTIVE = new Set([
  "draft",
  "queued",
  "installing",
  "stopping",
  "starting",
  "recovering",
]);

type BarMode = "none" | "determinate" | "indeterminate";

function explain(
  status: string,
  provisionMessage: string | null,
  lastError: string | null
): {
  headline: string;
  detail: string;
  pct: number;
  pulse: boolean;
  barMode: BarMode;
} {
  if (status === "failed") {
    return {
      headline: "Provisioning failed",
      detail:
        lastError ||
        "See logs on the host or try deleting and recreating.",
      pct: 0,
      pulse: false,
      barMode: "none",
    };
  }
  if (status === "running") {
    const deployed =
      provisionMessage?.toLowerCase().includes("dedicated command started") ??
      false;
    if (deployed) {
      return {
        headline: "Deployed & running",
        detail:
          provisionMessage ||
          "The agent finished installing Steam files and started your dedicated server command.",
        pct: 100,
        pulse: false,
        barMode: "determinate",
      };
    }
    return {
      headline: "Install complete",
      detail:
        provisionMessage ||
        "SteamCMD finished and game files are on disk. No dedicated process was started — check logs; set STEAMLINE_AFTER_INSTALL_CMD, catalog afterInstallCmd, or ensure a server binary is present for auto-launch.",
      pct: 100,
      pulse: false,
      barMode: "determinate",
    };
  }
  if (status === "pending_delete") {
    return {
      headline: "Removing on host…",
      detail:
        "The agent is stopping processes and deleting instance files.",
      pct: 55,
      pulse: true,
      barMode: "determinate",
    };
  }
  if (status === "stopped") {
    return {
      headline: "Stopped",
      detail:
        provisionMessage ||
        "The game server is not running. Firewall and router mappings for this server were closed where possible. Your game files are still on the host — press Start to play again.",
      pct: 0,
      pulse: false,
      barMode: "none",
    };
  }
  if (status === "stopping") {
    return {
      headline: "Stopping on host…",
      detail:
        provisionMessage ||
        "Ending the game process and taking down network openings for this server.",
      pct: 40,
      pulse: true,
      barMode: "indeterminate",
    };
  }
  if (status === "starting") {
    return {
      headline: "Starting on host…",
      detail:
        provisionMessage ||
        "Launching your game server again from the files already installed on the host.",
      pct: 60,
      pulse: true,
      barMode: "indeterminate",
    };
  }
  if (status === "recovering") {
    return {
      headline: "Automatic restart",
      detail:
        provisionMessage ||
        "The game process stopped or failed a health check. Steamline is trying to bring it back without reinstalling game files.",
      pct: 45,
      pulse: true,
      barMode: "indeterminate",
    };
  }
  if (status === "installing") {
    return {
      headline: "Installing (SteamCMD / setup)",
      detail:
        provisionMessage ||
        "Downloading or updating game files on the host. Large titles can take several minutes.",
      pct: 72,
      pulse: true,
      barMode: "determinate",
    };
  }
  if (status === "queued") {
    return {
      headline: "Queued — waiting for host agent",
      detail:
        provisionMessage ||
        "The control plane has handed this job to your host. The agent checks about every 30 seconds; ensure the agent process is running on the server.",
      pct: 0,
      pulse: true,
      barMode: "indeterminate",
    };
  }
  if (status === "draft") {
    return {
      headline: "Draft — waiting for agent",
      detail:
        "The host agent will move this to “queued” after it connects (heartbeat).",
      pct: 0,
      pulse: true,
      barMode: "indeterminate",
    };
  }
  return {
    headline: `Status: ${status}`,
    detail: provisionMessage || "Updating…",
    pct: 30,
    pulse: true,
    barMode: "determinate",
  };
}

/**
 * When rendered in a list, set a React key from instance id + `updatedAt` so
 * `router.refresh()` (e.g. after SSE) remounts with fresh `initial` props.
 */
export function InstanceDeployProgress({ instanceId, initial }: Props) {
  const [data, setData] = useState<InstancePayload>(initial);

  const { headline, detail, pct, pulse, barMode } = useMemo(
    () =>
      explain(
        data.status,
        data.provisionMessage,
        data.lastError
      ),
    [data.status, data.provisionMessage, data.lastError]
  );

  const shouldPoll =
    ACTIVE.has(data.status) || data.status === "pending_delete";

  const tick = useCallback(async () => {
    try {
      const res = await fetch(`/api/instances/${instanceId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        return;
      }
      const json = (await res.json()) as { instance?: InstancePayload };
      if (json.instance) {
        const inst = json.instance as InstancePayload & {
          updatedAt?: string;
        };
        setData((prev) => ({
          ...inst,
          updatedAt: inst.updatedAt ?? prev.updatedAt,
        }));
      }
    } catch {
      /* ignore */
    }
  }, [instanceId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      void tick();
    });
    if (!shouldPoll) {
      return () => {
        cancelled = true;
      };
    }
    const fast = window.setInterval(() => {
      if (!cancelled) {
        void tick();
      }
    }, 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(fast);
    };
  }, [tick, shouldPoll]);

  useHostRealtimeEvents(() => {
    void tick();
  });

  const failed = data.status === "failed";

  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <div>
        <p
          className={cn(
            "text-sm font-medium",
            failed ? "text-destructive" : "text-foreground"
          )}
        >
          {headline}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {detail}
        </p>
      </div>
      {data.logInsights?.bullets?.length ? (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-xs leading-relaxed",
            data.logInsights.severity === "warn"
              ? "border-amber-500/40 bg-amber-500/[0.08] text-amber-950 dark:text-amber-50/95"
              : "border-border/70 bg-muted/35 text-muted-foreground"
          )}
          role="note"
        >
          <p className="font-medium text-foreground/90">
            From recent logs — worth a quick look
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            {data.logInsights.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {barMode === "none" ? null : barMode === "indeterminate" ? (
        <div
          className={cn(
            "h-2 w-full overflow-hidden rounded-full bg-muted",
            pulse && "ring-1 ring-primary/15"
          )}
          role="progressbar"
          aria-valuetext="Waiting — progress is not available until the host starts work"
        >
          <div
            className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary/50 via-primary to-primary/50 animate-steamline-indeterminate"
            style={{ willChange: "transform" }}
          />
        </div>
      ) : (
        <div
          className={cn(
            "h-2 w-full overflow-hidden rounded-full bg-muted",
            pulse && "ring-1 ring-primary/20"
          )}
        >
          <div
            className={cn(
              "h-full rounded-full bg-gradient-to-r from-primary/85 to-primary transition-[width] duration-700 ease-out",
              pulse && "animate-pulse"
            )}
            style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
          />
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        <span className="text-foreground">
          {instanceDashboardStatusLabel(
            data.status,
            data.provisionMessage
          )}
        </span>
        <span className="text-muted-foreground/80">
          {" "}
          (API:{" "}
          <span className="font-mono text-foreground/90">{data.status}</span>)
        </span>
        {" · "}
        Updated{" "}
        {new Date(data.updatedAt).toLocaleTimeString(undefined, {
          timeStyle: "medium",
        })}
      </p>
      <DeploymentPlaybook
        instanceId={instanceId}
        hostName={data.hostName}
        hostMetrics={data.hostMetrics}
        status={data.status}
        provisionMessage={data.provisionMessage}
        allocatedPorts={data.allocatedPorts}
        hostReachable={data.hostReachable ?? true}
      />
    </div>
  );
}
