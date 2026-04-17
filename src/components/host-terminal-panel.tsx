"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Loader2, Terminal as TerminalIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import "@xterm/xterm/css/xterm.css";

function decodeB64Utf8(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

type Props = {
  hostId: string;
  /** linux agent only — others show an explanation */
  platformOs: string | null;
  /** Recent agent heartbeat */
  hostReachable: boolean;
};

export function HostTerminalPanel({
  hostId,
  platformOs,
  hostReachable,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [errorText, setErrorText] = useState<string | null>(null);

  const disconnect = useCallback(() => {
    setActive(false);
    setStatus("idle");
    setErrorText(null);
  }, []);

  const connect = useCallback(() => {
    if (platformOs !== "linux" || !hostReachable) {
      return;
    }
    setErrorText(null);
    setStatus("connecting");
    setActive(true);
  }, [hostReachable, platformOs]);

  useEffect(() => {
    if (!active || !containerRef.current) {
      return;
    }

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      theme: {
        background: "#0c0c0e",
        foreground: "#e4e4e7",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${proto}//${window.location.host}/api/hosts/ws-terminal?hostId=${encodeURIComponent(hostId)}`
    );

    ws.onopen = () => {
      setStatus("connecting");
    };

    ws.onmessage = (ev) => {
      try {
        const j = JSON.parse(ev.data as string) as {
          type?: string;
          base64?: string;
          message?: string;
          sessionId?: string;
        };
        if (j.type === "ready") {
          setStatus("connected");
          fit.fit();
          ws.send(
            JSON.stringify({
              type: "resize",
              cols: term.cols,
              rows: term.rows,
            })
          );
          return;
        }
        if (j.type === "output" && j.base64) {
          term.write(decodeB64Utf8(j.base64));
          return;
        }
        if (j.type === "error") {
          setErrorText(j.message ?? "Terminal error");
          setStatus("error");
        }
      } catch {
        /* ignore */
      }
    };

    const onData = (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "stdin", text: data }));
      }
    };
    term.onData(onData);

    ws.onerror = () => {
      setErrorText("Connection failed.");
      setStatus("error");
    };

    const onResize = () => {
      try {
        fit.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "resize",
              cols: term.cols,
              rows: term.rows,
            })
          );
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      term.dispose();
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }, [active, hostId]);

  const linuxOnly = platformOs === "linux";

  return (
    <Card className="border-border/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TerminalIcon className="size-4" aria-hidden />
          Remote terminal
        </CardTitle>
        <CardDescription>
          Browser-based shell on the host (Linux + agent connected over WebSocket).
          Up to five sessions per host; sessions end after 30 minutes of inactivity.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!linuxOnly ? (
          <p className="text-sm text-muted-foreground">
            Remote terminal is only available for hosts enrolled as{" "}
            <strong className="text-foreground">Linux</strong>.
          </p>
        ) : !hostReachable ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            The agent must be online (recent heartbeat) to open a terminal.
          </p>
        ) : null}

        {errorText ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">{errorText}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {!active ? (
            <Button
              type="button"
              size="sm"
              disabled={!linuxOnly || !hostReachable}
              onClick={connect}
            >
              Open terminal
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={disconnect}
              >
                Disconnect
              </Button>
              {status === "connecting" ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Connecting…
                </span>
              ) : null}
            </>
          )}
          {status === "connected" ? (
            <span className="text-xs text-primary">Connected</span>
          ) : null}
        </div>

        {active ? (
          <div
            ref={containerRef}
            className="min-h-[280px] w-full overflow-hidden rounded-md border border-border/80 bg-[#0c0c0e] p-1"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
