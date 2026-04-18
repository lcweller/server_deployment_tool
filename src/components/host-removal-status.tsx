"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useHostRealtimeForHost } from "@/lib/realtime/use-host-realtime-events";
import { cn } from "@/lib/utils";

type Props = {
  hostId: string;
  initialStatus: string;
  instancesPendingDelete: number;
  instanceTotal: number;
};

export function HostRemovalStatus({
  hostId,
  initialStatus,
  instancesPendingDelete,
  instanceTotal,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [pendingDelete, setPendingDelete] = useState(instancesPendingDelete);
  const [total, setTotal] = useState(instanceTotal);
  const [forceBusy, setForceBusy] = useState(false);
  const syncHost = useCallback(async () => {
    try {
      const res = await fetch(`/api/hosts/${hostId}`, { cache: "no-store" });
      if (res.status === 404) {
        router.push("/hosts");
        router.refresh();
        return;
      }
      if (!res.ok) {
        return;
      }
      const j = (await res.json()) as {
        host?: {
          status: string;
          instancesPendingDelete?: number;
          instanceTotal?: number;
        };
      };
      if (j.host) {
        setStatus(j.host.status);
        if (j.host.instancesPendingDelete != null) {
          setPendingDelete(j.host.instancesPendingDelete);
        }
        if (j.host.instanceTotal != null) {
          setTotal(j.host.instanceTotal);
        }
      }
    } catch {
      /* ignore */
    }
  }, [hostId, router]);

  useEffect(() => {
    if (status !== "pending_removal") {
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (cancelled) {
        return;
      }
      void syncHost();
    };
    const id = window.setInterval(() => {
      tick();
    }, 12_000);
    tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [status, syncHost]);

  useHostRealtimeForHost(hostId, () => {
    void syncHost();
  });

  async function onForceRemoveFromDashboard() {
    const ok = window.confirm(
      "Remove this host from your Steamline account without waiting for the agent?\n\n" +
        "Use this if the machine is offline, wiped, or the agent will never run again. " +
        "This only deletes dashboard data — it does not uninstall anything on the server. " +
        "Before enrolling the same machine again, delete ~/.steamline on it (or reinstall)."
    );
    if (!ok) return;
    setForceBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}?force=1`, {
        method: "DELETE",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? `Remove failed (${res.status})`);
        return;
      }
      router.push("/hosts");
      router.refresh();
    } finally {
      setForceBusy(false);
    }
  }

  if (status !== "pending_removal") {
    return null;
  }

  const phase =
    total > 0
      ? "Deleting game server data on the host"
      : "No instances left — wiping Steamline data and unregistering";

  const detail =
    total > 0
      ? `${pendingDelete} instance(s) still queued for deletion on the agent (${total} total row(s) in the dashboard until purge completes).`
      : "The agent should remove local data, call the API, and disappear from your list. If this sits here for a long time, the agent is probably not running on the machine.";

  return (
    <div
      className={cn(
        "rounded-xl border border-amber-500/35 bg-amber-500/[0.07] p-4 shadow-sm",
        "ring-1 ring-amber-500/20"
      )}
    >
      <div className="flex gap-3">
        <AlertTriangle
          className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Host removal in progress
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">{phase}.</span>{" "}
            {detail}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Status:{" "}
            <span className="font-mono text-foreground">pending_removal</span>
          </p>
          <div className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-amber-600/40 text-amber-900 hover:bg-amber-500/15 dark:text-amber-100"
              disabled={forceBusy}
              onClick={() => void onForceRemoveFromDashboard()}
            >
              {forceBusy ? "Removing…" : "Remove from dashboard only"}
            </Button>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
              For offline or decommissioned hosts: drops this host and its servers
              from your account so you can enroll again. Does not touch the remote
              machine.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
