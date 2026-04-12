"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  hostId: string;
  hostStatus: string;
  initialSteamUsername: string | null;
};

export function HostSteamSettings({
  hostId,
  hostStatus,
  initialSteamUsername,
}: Props) {
  const router = useRouter();
  const [username, setUsername] = useState(initialSteamUsername ?? "");
  const [password, setPassword] = useState("");
  const [guardCode, setGuardCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPush(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/hosts/${hostId}/steam-credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steamUsername: username.trim(),
          steamPassword: password,
          ...(guardCode.trim()
            ? { steamGuardCode: guardCode.trim() }
            : {}),
        }),
      });
      const text = await res.text();
      let body: { error?: string; message?: string } = {};
      try {
        body = JSON.parse(text) as typeof body;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        setError(body.error ?? text ?? `Request failed (${res.status})`);
        return;
      }
      setPassword("");
      setGuardCode("");
      setMessage(
        body.message ??
          "Queued for your host. The agent saves this automatically on its next check-in — nothing to type on the server."
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const blocked = hostStatus === "pending";

  return (
    <form onSubmit={onPush} className="space-y-4">
      {blocked ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Finish enrolling this host first. After the agent connects, you can
          push Steam credentials from here.
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="steam-username">Steam username</Label>
        <Input
          id="steam-username"
          name="steamUsername"
          autoComplete="username"
          placeholder="Your Steam account name"
          value={username}
          onChange={(ev) => setUsername(ev.target.value)}
          maxLength={64}
          disabled={blocked}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="steam-password">Steam password</Label>
        <Input
          id="steam-password"
          name="steamPassword"
          type="password"
          autoComplete="current-password"
          placeholder="Only used once to reach your host over TLS"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          disabled={blocked}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="steam-guard">Steam Guard code (optional)</Label>
        <Input
          id="steam-guard"
          name="steamGuardCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="Email code if Steam asks on the next login"
          value={guardCode}
          onChange={(ev) => setGuardCode(ev.target.value)}
          maxLength={12}
          disabled={blocked}
        />
      </div>

      <Button type="submit" size="sm" disabled={saving || blocked}>
        {saving ? "Pushing…" : "Push to host"}
      </Button>

      <p className="text-[11px] leading-snug text-muted-foreground">
        Encrypted on the server, sent once to your agent over HTTPS, then removed
        from our database. The agent writes{" "}
        <code className="rounded bg-muted px-1">~/.steamline/steamline-agent.env</code>{" "}
        and restricts the file permissions where the OS allows it.
      </p>

      {message ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive whitespace-pre-wrap">{error}</p>
      ) : null}
    </form>
  );
}
