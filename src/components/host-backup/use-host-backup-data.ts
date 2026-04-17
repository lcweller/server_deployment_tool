"use client";

import { useCallback, useEffect, useState } from "react";

import { useHostRealtimeForHost } from "@/lib/realtime/use-host-realtime-events";

import type { DestinationRow, InstanceOpt, PolicyRow, RunRow } from "./types";

export function useHostBackupData(hostId: string) {
  const [destinations, setDestinations] = useState<DestinationRow[]>([]);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [instances, setInstances] = useState<InstanceOpt[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [bRes, iRes] = await Promise.all([
        fetch(`/api/hosts/${hostId}/backups`),
        fetch("/api/instances"),
      ]);
      const b = (await bRes.json()) as {
        destinations?: DestinationRow[];
        policies?: PolicyRow[];
        runs?: RunRow[];
        error?: string;
      };
      if (!bRes.ok) {
        setErr(b.error ?? `Load failed (${bRes.status})`);
        return;
      }
      setDestinations(b.destinations ?? []);
      setPolicies(b.policies ?? []);
      setRuns(
        (b.runs ?? []).map((r) => ({
          ...(r as RunRow),
          createdAt: String((r as { createdAt?: string }).createdAt ?? ""),
          destinationKind:
            (r as { destinationKind?: string | null }).destinationKind ?? null,
        }))
      );
      const ij = (await iRes.json()) as { instances?: InstanceOpt[] };
      setInstances(
        (ij.instances ?? []).filter(
          (i) => i.hostId === hostId && i.status !== "pending_delete"
        )
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    }
  }, [hostId]);

  useEffect(() => {
    void load();
  }, [load]);

  useHostRealtimeForHost(hostId, () => {
    void load();
  });

  return {
    destinations,
    policies,
    runs,
    instances,
    err,
    setErr,
    load,
  };
}
