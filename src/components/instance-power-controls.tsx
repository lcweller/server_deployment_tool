"use client";

import { Power, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  instanceId: string;
  instanceName: string;
  status: string;
  /** When false, start/stop requests are disabled (no recent agent heartbeat). */
  hostReachable?: boolean;
  className?: string;
};

export function InstancePowerControls({
  instanceId,
  instanceName,
  status,
  hostReachable = true,
  className,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hidden =
    status === "draft" ||
    status === "queued" ||
    status === "installing" ||
    status === "failed" ||
    status === "pending_delete";

  if (hidden) {
    return null;
  }

  const hostUnreachable = hostReachable === false;
  const transitional = status === "stopping" || status === "starting";

  async function send(power: "stop" | "start") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/instances/${instanceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ power }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(j.error ?? `Request failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {status === "running" || status === "recovering" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || hostUnreachable}
            title={
              hostUnreachable
                ? "Host agent is not reporting — power the machine on or fix connectivity"
                : undefined
            }
            className="gap-1.5"
            onClick={() => {
              void send("stop");
            }}
            aria-label={`Stop server ${instanceName}`}
          >
            <Square className="size-3.5" aria-hidden />
            Stop
          </Button>
        ) : null}
        {status === "stopped" ? (
          <Button
            type="button"
            size="sm"
            disabled={busy || hostUnreachable}
            title={
              hostUnreachable
                ? "Host agent is not reporting — power the machine on or fix connectivity"
                : undefined
            }
            className="gap-1.5"
            onClick={() => {
              void send("start");
            }}
            aria-label={`Start server ${instanceName}`}
          >
            <Power className="size-3.5" aria-hidden />
            Start
          </Button>
        ) : null}
        {transitional ? (
          <span className="text-xs text-muted-foreground">
            {status === "stopping"
              ? hostUnreachable
                ? "Stop requested — waiting for the host agent (machine may be off)."
                : "Stopping on your host…"
              : hostUnreachable
                ? "Start requested — waiting for the host agent (machine may be off)."
                : "Starting on your host…"}
          </span>
        ) : null}
        {status === "recovering" && hostReachable ? (
          <span className="text-xs text-muted-foreground">
            Automatic restart in progress on your host…
          </span>
        ) : null}
        {hostUnreachable &&
        (status === "running" ||
          status === "recovering" ||
          status === "stopped") ? (
          <span className="text-xs text-amber-800 dark:text-amber-500/95">
            Host appears offline (no recent heartbeat). Power and connectivity
            tasks resume when the agent reconnects.
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
