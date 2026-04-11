"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  hostId: string;
  initialSteamUsername: string | null;
};

export function HostSteamSettings({ hostId, initialSteamUsername }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initialSteamUsername ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/hosts/${hostId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steamUsername: value.trim() === "" ? null : value.trim(),
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        setError(text || `Save failed (${res.status})`);
        return;
      }
      setMessage("Saved. Set matching credentials on the host (see below); the API never stores your Steam password.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="steam-username">Steam username (optional)</Label>
        <Input
          id="steam-username"
          name="steamUsername"
          autoComplete="username"
          placeholder="Same account you use in SteamCMD on this host"
          value={value}
          onChange={(ev) => setValue(ev.target.value)}
          maxLength={64}
        />
        <p className="text-[11px] leading-snug text-muted-foreground">
          Used for your notes and as a hint for{" "}
          <code className="rounded bg-muted px-1">steamline-agent steam-login</code>.
          Put the password only in{" "}
          <code className="rounded bg-muted px-1">STEAMLINE_STEAM_PASSWORD</code> or{" "}
          <code className="rounded bg-muted px-1">STEAMLINE_STEAM_PASSWORD_FILE</code>{" "}
          on the machine — never in the dashboard.
        </p>
      </div>
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
      {message ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive whitespace-pre-wrap">{error}</p>
      ) : null}
    </form>
  );
}
