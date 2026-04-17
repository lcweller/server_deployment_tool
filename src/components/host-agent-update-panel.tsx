"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useHostRealtimeForHost } from "@/lib/realtime/use-host-realtime-events";

type UpdateEvent = {
  phase: string;
  message?: string;
  at: string;
};

type UpdateInfo = {
  artifactReady: boolean;
  installedSemver: string | null;
  latestSemver: string;
  releaseNotes: string | null;
  minAgentVersion: string | null;
  updateAvailable: boolean;
  lastEvent: UpdateEvent | null;
  history: UpdateEvent[];
};

type Props = {
  hostId: string;
  platformOs: string | null | undefined;
  agentReachable: boolean;
};

export function HostAgentUpdatePanel({
  hostId,
  platformOs,
  agentReachable,
}: Props) {
  function phaseLabel(ev: UpdateEvent): string {
    if (ev.phase === "error" && ev.message?.toLowerCase().includes("rolled back")) {
      return "rollback";
    }
    return ev.phase;
  }
  const router = useRouter();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch(`/api/hosts/${hostId}/agent-update`);
      const j = (await res.json()) as Partial<UpdateInfo> & { error?: string };
      if (!res.ok) {
        setErr(j.error ?? `Load failed (${res.status})`);
        return;
      }
      setInfo({
        artifactReady: Boolean(j.artifactReady),
        installedSemver: j.installedSemver ?? null,
        latestSemver: j.latestSemver ?? "",
        releaseNotes: j.releaseNotes ?? null,
        minAgentVersion: j.minAgentVersion ?? null,
        updateAvailable: Boolean(j.updateAvailable),
        lastEvent: j.lastEvent ?? null,
        history: Array.isArray(j.history) ? j.history : [],
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    }
  }, [hostId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      void load();
    }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  useHostRealtimeForHost(hostId, () => {
    void load();
  });

  const linux = platformOs === "linux";
  const canUse = linux && agentReachable;

  async function postAction(action: "apply" | "check") {
    if (action === "apply") {
      const ok = window.confirm(
        "Download and install the latest agent from this dashboard, then restart the agent process? " +
          "Game servers keep running; the agent briefly disconnects during restart."
      );
      if (!ok) {
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}/agent-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        alert(j.message ?? j.error ?? `Request failed (${res.status})`);
        return;
      }
      await load();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border/80">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Agent updates</CardTitle>
          <CardDescription>
            Self-update uses the bundled agent shipped with this control plane.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {err ? (
          <p className="text-destructive text-xs">{err}</p>
        ) : null}
        {!info ? (
          <p className="text-muted-foreground text-xs">Loading…</p>
        ) : !info.artifactReady ? (
          <p className="text-amber-600 text-xs">
            The server does not have a built agent artifact (
            <code className="rounded bg-muted px-1">public/steamline-agent.cjs</code>
            ). Build the dashboard with{" "}
            <code className="rounded bg-muted px-1">npm run agent:bundle</code>{" "}
            before updates can run.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">Published version</span>
              <code className="font-mono text-xs">{info.latestSemver}</code>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">This host reports</span>
              <code className="font-mono text-xs">
                {info.installedSemver ?? "—"}
              </code>
            </div>
            {info.updateAvailable ? (
              <p className="text-amber-600 text-xs font-medium">
                A newer agent is available.
              </p>
            ) : info.installedSemver ? (
              <p className="text-muted-foreground text-xs">Agent is up to date.</p>
            ) : (
              <p className="text-muted-foreground text-xs">
                No version from heartbeat yet — after the agent connects, this
                compares to the published build.
              </p>
            )}
            {info.releaseNotes ? (
              <p className="text-muted-foreground border-border/60 border-t pt-2 text-xs leading-snug">
                {info.releaseNotes}
              </p>
            ) : null}
            {info.history.length > 0 ? (
              <div className="border-border/60 space-y-1 border-t pt-2">
                <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                  Recent activity
                </p>
                <ul className="max-h-40 space-y-1.5 overflow-y-auto text-xs">
                  {info.history.map((ev, i) => (
                    <li
                      key={`${ev.at}-${i}`}
                      className="border-border/40 flex flex-col gap-0.5 border-b pb-1.5 last:border-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{phaseLabel(ev)}</span>
                        <time
                          className="text-muted-foreground font-mono text-[10px]"
                          dateTime={ev.at}
                        >
                          {new Date(ev.at).toLocaleString(undefined, {
                            dateStyle: "short",
                            timeStyle: "medium",
                          })}
                        </time>
                      </div>
                      {ev.message ? (
                        <span className="text-muted-foreground leading-snug">
                          {ev.message}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!linux ? (
              <p className="text-muted-foreground text-xs">
                Self-update installs when the agent runs on{" "}
                <strong>Linux</strong> from{" "}
                <code className="rounded bg-muted px-1">~/.steamline/steamline-agent.cjs</code>.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canUse || busy || !info.artifactReady}
                onClick={() => void postAction("check")}
              >
                Check on host
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={
                  !canUse ||
                  busy ||
                  !info.artifactReady ||
                  !info.updateAvailable
                }
                onClick={() => void postAction("apply")}
              >
                Update now
              </Button>
            </div>
            {!agentReachable ? (
              <p className="text-muted-foreground text-xs">
                Connect the agent over WebSocket so the dashboard can send update
                commands (REST-only agents cannot be updated remotely from here).
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
