"use client";

import { Copy, Terminal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LogRow = { id: number; line: string; at: string };

type Props = {
  instanceId: string;
  className?: string;
};

const MAX_RECONNECT_MS = 30_000;

/** Remount when `instanceId` changes (`key`) so log state resets without setState in an effect. */
function InstanceLogsInner({
  instanceId,
  className,
}: {
  instanceId: string;
  className?: string;
}) {
  const [lines, setLines] = useState<LogRow[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Set<number>>(new Set());
  const lastLogIdRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      if (cancelled) {
        return;
      }
      clearReconnect();
      es?.close();

      const after = lastLogIdRef.current;
      const url = `/api/instances/${instanceId}/logs/stream?after=${after}`;
      es = new EventSource(url);

      es.addEventListener("ready", () => {
        attempt = 0;
        setConnected(true);
        setError(null);
      });

      es.addEventListener("log", (ev) => {
        try {
          const raw = JSON.parse((ev as MessageEvent).data) as {
            id: number;
            line: string;
            at: string | Date;
          };
          if (seen.current.has(raw.id)) {
            return;
          }
          seen.current.add(raw.id);
          lastLogIdRef.current = Math.max(lastLogIdRef.current, raw.id);
          const data: LogRow = {
            id: raw.id,
            line: raw.line,
            at:
              typeof raw.at === "string"
                ? raw.at
                : new Date(raw.at).toISOString(),
          };
          setLines((prev) => {
            const next = [...prev, data];
            if (next.length > 8000) {
              return next.slice(-8000);
            }
            return next;
          });
        } catch {
          /* ignore */
        }
      });

      es.onerror = () => {
        es?.close();
        if (cancelled) {
          return;
        }
        setConnected(false);
        attempt += 1;
        const delay = Math.min(
          MAX_RECONNECT_MS,
          1000 * 2 ** Math.min(attempt - 1, 6)
        );
        if (attempt >= 2) {
          setError("Log stream interrupted — reconnecting…");
        }
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearReconnect();
      es?.close();
    };
  }, [instanceId]);

  useEffect(() => {
    if (open && lines.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [lines.length, open]);

  const text = lines.map((l) => l.line).join("\n");

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }, [text]);

  return (
    <div className={cn("mt-3 border-t border-border/60 pt-3", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-medium text-foreground">
          <Terminal className="size-3.5 text-muted-foreground" aria-hidden />
          Instance logs (provisioning and diagnostics)
        </span>
        <span className="text-[11px] text-muted-foreground">
          {open ? "Hide" : "Show"} ({lines.length} lines
          {connected ? ", live" : ""})
        </span>
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          {error ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={lines.length === 0}
              onClick={onCopy}
            >
              <Copy className="size-3" />
              Copy all
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Includes SteamCMD output and{" "}
              <code className="rounded bg-muted px-0.5">diag:</code> lines for
              support.
            </span>
          </div>
          <pre
            className="max-h-[min(28rem,60vh)] overflow-auto rounded-md border border-border/80 bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-foreground/95 whitespace-pre-wrap break-words"
            tabIndex={0}
          >
            {lines.length === 0 ? (
              <span className="text-muted-foreground">
                {connected
                  ? "Waiting for log lines from the agent…"
                  : "Connecting…"}
              </span>
            ) : (
              lines.map((l) => (
                <span key={l.id}>
                  {l.line}
                  {"\n"}
                </span>
              ))
            )}
            <div ref={bottomRef} />
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export function InstanceLogsPanel({ instanceId, className }: Props) {
  return (
    <InstanceLogsInner key={instanceId} instanceId={instanceId} className={className} />
  );
}
