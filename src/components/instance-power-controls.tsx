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
  className?: string;
};

export function InstancePowerControls({
  instanceId,
  instanceName,
  status,
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

  const canStop = status === "running" || status === "recovering";
  const canStart = status === "stopped";
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
        {canStop ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
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
        {canStart ? (
          <Button
            type="button"
            size="sm"
            disabled={busy}
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
              ? "Stopping on your host…"
              : "Starting on your host…"}
          </span>
        ) : null}
        {status === "recovering" ? (
          <span className="text-xs text-muted-foreground">
            Automatic restart in progress on your host…
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
