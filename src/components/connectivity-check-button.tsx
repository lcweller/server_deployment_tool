"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type Result = {
  headline: string;
  detail: string;
  disclaimer: string;
};

type Props = {
  instanceId: string;
};

export function ConnectivityCheckButton({ instanceId }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/instances/${instanceId}/connectivity-check`,
        { method: "POST" }
      );
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        headline?: string;
        detail?: string;
        disclaimer?: string;
      };
      if (!res.ok) {
        setError(j.error ?? `Check failed (${res.status})`);
        return;
      }
      if (!j.headline || !j.detail || !j.disclaimer) {
        setError("Unexpected response from the server.");
        return;
      }
      setResult({
        headline: j.headline,
        detail: j.detail,
        disclaimer: j.disclaimer,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-border/50 pt-3">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => {
          void run();
        }}
      >
        {busy ? "Testing…" : "Test connection from the internet"}
      </Button>
      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
        We try a short TCP check from Steamline to your host&apos;s public IPv4.
        Many games use UDP as well — read the note below the result.
      </p>
      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="mt-2 space-y-1.5 rounded-md border border-border/60 bg-muted/30 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">{result.headline}</p>
          <p>{result.detail}</p>
          <p className="border-t border-border/40 pt-1.5 text-[10px] text-muted-foreground/95">
            {result.disclaimer}
          </p>
        </div>
      ) : null}
    </div>
  );
}
