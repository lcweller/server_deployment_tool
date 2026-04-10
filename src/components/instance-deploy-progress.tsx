"use client";

import { useEffect, useMemo, useState } from "react";

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
};

type Props = {
  instanceId: string;
  initial: InstancePayload;
};

const ACTIVE = new Set([
  "draft",
  "queued",
  "installing",
]);

function explain(
  status: string,
  provisionMessage: string | null,
  lastError: string | null
): { headline: string; detail: string; pct: number; pulse: boolean } {
  if (status === "failed") {
    return {
      headline: "Provisioning failed",
      detail: lastError || "See logs on the host or try deleting and recreating.",
      pct: 0,
      pulse: false,
    };
  }
  if (status === "running") {
    return {
      headline: "Running",
      detail:
        provisionMessage ||
        "The agent finished installing; your dedicated process may still be starting.",
      pct: 100,
      pulse: false,
    };
  }
  if (status === "pending_delete") {
    return {
      headline: "Removing on host…",
      detail: "The agent is stopping processes and deleting instance files.",
      pct: 55,
      pulse: true,
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
    };
  }
  if (status === "queued") {
    return {
      headline: "Queued — waiting for host agent",
      detail:
        provisionMessage ||
        "The control plane has handed this job to your host. The agent checks about every 30 seconds; ensure the agent process is running on the server.",
      pct: 40,
      pulse: true,
    };
  }
  if (status === "draft") {
    return {
      headline: "Draft — waiting for agent",
      detail:
        "The host agent will move this to “queued” after it connects (heartbeat).",
      pct: 18,
      pulse: true,
    };
  }
  return {
    headline: `Status: ${status}`,
    detail: provisionMessage || "Updating…",
    pct: 30,
    pulse: true,
  };
}

export function InstanceDeployProgress({ instanceId, initial }: Props) {
  const [data, setData] = useState<InstancePayload>(initial);

  const { headline, detail, pct, pulse } = useMemo(
    () =>
      explain(
        data.status,
        data.provisionMessage,
        data.lastError
      ),
    [data.status, data.provisionMessage, data.lastError]
  );

  const shouldPoll = ACTIVE.has(data.status) || data.status === "pending_delete";

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }
    const tick = async () => {
      try {
        const res = await fetch(`/api/instances/${instanceId}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          return;
        }
        const json = (await res.json()) as { instance?: InstancePayload };
        if (json.instance) {
          setData((prev) => ({
            ...json.instance!,
            updatedAt:
              json.instance!.updatedAt ?? prev.updatedAt,
          }));
        }
      } catch {
        /* ignore */
      }
    };
    const fast = window.setInterval(tick, 2500);
    void tick();
    return () => window.clearInterval(fast);
  }, [instanceId, shouldPoll, data.status]);

  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <div>
        <p className="text-sm font-medium text-foreground">{headline}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {detail}
        </p>
      </div>
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
      <p className="text-[11px] text-muted-foreground">
        Step signal: <span className="font-mono text-foreground">{data.status}</span>
        {" · "}
        Updated{" "}
        {new Date(data.updatedAt).toLocaleTimeString(undefined, {
          timeStyle: "medium",
        })}
      </p>
    </div>
  );
}
