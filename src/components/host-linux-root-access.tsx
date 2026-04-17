"use client";

import { Copy, Eye, EyeOff, KeyRound, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
type Props = {
  hostId: string;
  platformOs: string | null;
};

export function HostLinuxRootAccess({ hostId, platformOs }: Props) {
  const [meta, setMeta] = useState<{
    hasPassword: boolean;
    deliveryPending: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState("");
  const [showPlain, setShowPlain] = useState(false);
  const [customPw, setCustomPw] = useState("");
  const [rotateResult, setRotateResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshMeta = useCallback(async () => {
    const res = await fetch(`/api/hosts/${hostId}/linux-root-password`, {
      cache: "no-store",
    });
    if (!res.ok) {
      setMeta(null);
      return;
    }
    const j = (await res.json()) as {
      hasPassword?: boolean;
      deliveryPending?: boolean;
    };
    setMeta({
      hasPassword: Boolean(j.hasPassword),
      deliveryPending: Boolean(j.deliveryPending),
    });
  }, [hostId]);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta]);

  if (platformOs !== "linux") {
    return null;
  }

  async function reveal() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}/linux-root-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reveal" }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        password?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(j.error ?? `Reveal failed (${res.status})`);
        return;
      }
      if (j.password) {
        setRevealed(j.password);
        setShowPlain(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    setError(null);
    setRotateResult(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}/linux-root-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate" }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        password?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(j.error ?? `Rotate failed (${res.status})`);
        return;
      }
      if (j.password) {
        setRotateResult(j.password);
        setRevealed(j.password);
        setShowPlain(true);
      }
      void refreshMeta();
    } finally {
      setBusy(false);
    }
  }

  async function setCustom() {
    setError(null);
    if (customPw.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}/linux-root-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", password: customPw }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? `Queue failed (${res.status})`);
        return;
      }
      setCustomPw("");
      void refreshMeta();
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  return (
    <Card className="border-border/80">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="size-4" aria-hidden />
          Linux root access
        </CardTitle>
        <CardDescription>
          The installer sets a random <code className="rounded bg-muted px-1">root</code>{" "}
          password when you run it as{" "}
          <code className="rounded bg-muted px-1">sudo</code> (encrypted in the database).
          Reveal it here, rotate it, or queue a custom password — the agent applies changes on
          the next heartbeat (run the agent as root or with passwordless{" "}
          <code className="rounded bg-muted px-1">sudo chpasswd</code>).{" "}
          <span className="text-muted-foreground">
            “Reveal” shows the last password stored after the agent applied it; right after you
            queue a rotation, use the generated value shown once or wait for delivery.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {meta?.deliveryPending ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
            A password change is queued — waiting for the agent to apply it (usually within a
            few seconds).
          </p>
        ) : null}
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : null}

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="root-pw-field">
              Stored root password
            </label>
            <div className="flex gap-2">
              <Input
                id="root-pw-field"
                readOnly
                className="font-mono text-xs"
                type={showPlain ? "text" : "password"}
                value={revealed}
                placeholder={
                  meta?.hasPassword && !revealed
                    ? "Hidden — click Reveal"
                    : meta?.hasPassword
                      ? ""
                      : "Available after install with sudo bash"
                }
                onChange={() => {}}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={busy || !revealed}
                onClick={() => setShowPlain((s) => !s)}
                aria-label={showPlain ? "Hide password" : "Show password as text"}
              >
                {showPlain ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0"
                disabled={busy || !revealed}
                onClick={() => void copy(revealed)}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !meta?.hasPassword}
            onClick={() => void reveal()}
          >
            Reveal
          </Button>
        </div>

        {rotateResult ? (
          <p className="text-xs text-muted-foreground">
            New password generated — shown above. It will be applied on the host when the agent
            heartbeats.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void rotate()}
          >
            <RefreshCw className="size-4" data-icon="inline-start" />
            Generate &amp; queue new password
          </Button>
        </div>

        <details className="rounded-md border border-border/60 bg-muted/15 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-foreground">
            Set a custom password
          </summary>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input
              type="password"
              autoComplete="new-password"
              className="font-mono text-xs sm:max-w-md"
              placeholder="At least 12 characters"
              value={customPw}
              onChange={(e) => setCustomPw(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              disabled={busy || customPw.length < 12}
              onClick={() => void setCustom()}
            >
              Queue for host
            </Button>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
