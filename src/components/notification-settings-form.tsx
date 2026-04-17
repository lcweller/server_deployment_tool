"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Prefs = {
  eventType: string;
  email: boolean;
  webhook: boolean;
};

export function NotificationSettingsForm() {
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [resendApiKey, setResendApiKey] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [cooldown, setCooldown] = useState(300);
  const [dedup, setDedup] = useState(600);
  const [prefs, setPrefs] = useState<Prefs[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/notification-settings");
    if (!res.ok) return;
    const j = (await res.json()) as {
      settings: {
        emailEnabled: boolean;
        webhookEnabled: boolean;
        resendApiKey: string | null;
        webhookUrl: string | null;
        webhookSecret: string | null;
        alertCooldownSec: number;
        crashDedupSec: number;
      } | null;
      eventPrefs: Prefs[];
      eventTypes: string[];
    };
    if (j.settings) {
      setEmailEnabled(j.settings.emailEnabled);
      setWebhookEnabled(j.settings.webhookEnabled);
      setResendApiKey(j.settings.resendApiKey ?? "");
      setWebhookUrl(j.settings.webhookUrl ?? "");
      setWebhookSecret(j.settings.webhookSecret ?? "");
      setCooldown(j.settings.alertCooldownSec ?? 300);
      setDedup(j.settings.crashDedupSec ?? 600);
    }
    const map = new Map<string, Prefs>();
    for (const t of j.eventTypes ?? []) {
      map.set(t, { eventType: t, email: true, webhook: false });
    }
    for (const p of j.eventPrefs ?? []) {
      map.set(p.eventType, p);
    }
    setPrefs([...map.values()]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/notification-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled,
          webhookEnabled,
          resendApiKey: resendApiKey || null,
          webhookUrl: webhookUrl || null,
          webhookSecret: webhookSecret || null,
          alertCooldownSec: cooldown,
          crashDedupSec: dedup,
          eventPrefs: prefs,
        }),
      });
      if (!res.ok) {
        setMsg("Save failed.");
        return;
      }
      setMsg("Saved.");
    } finally {
      setBusy(false);
    }
  };

  const testWebhook = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/notification-settings/test-webhook", {
        method: "POST",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; status?: number };
      if (!res.ok) {
        setMsg(j.error ?? "Test failed");
        return;
      }
      setMsg(`Webhook responded HTTP ${j.status ?? "?"}`);
    } finally {
      setBusy(false);
    }
  };

  const togglePref = (eventType: string, field: "email" | "webhook", v: boolean) => {
    setPrefs((prev) =>
      prev.map((p) => (p.eventType === eventType ? { ...p, [field]: v } : p))
    );
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Global email channel</Label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
            />
            Enable email (requires Resend API key)
          </label>
        </div>
        <div className="space-y-2">
          <Label>Global webhook channel</Label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={webhookEnabled}
              onChange={(e) => setWebhookEnabled(e.target.checked)}
            />
            Enable webhook POSTs
          </label>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Resend API key (optional override; server may use RESEND_API_KEY)</Label>
          <Input
            type="password"
            value={resendApiKey}
            onChange={(e) => setResendApiKey(e.target.value)}
            placeholder="re_..."
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Webhook URL</Label>
          <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Webhook secret (sent as X-Steamline-Signature header)</Label>
          <Input value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Alert cooldown (seconds)</Label>
          <Input
            type="number"
            min={60}
            max={3600}
            value={cooldown}
            onChange={(e) => setCooldown(Number(e.target.value) || 300)}
          />
        </div>
        <div className="space-y-1">
          <Label>Crash dedup window (seconds)</Label>
          <Input
            type="number"
            min={60}
            max={7200}
            value={dedup}
            onChange={(e) => setDedup(Number(e.target.value) || 600)}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="p-2">Event</th>
              <th className="p-2">Email</th>
              <th className="p-2">Webhook</th>
            </tr>
          </thead>
          <tbody>
            {prefs.map((p) => (
              <tr key={p.eventType} className="border-b last:border-0">
                <td className="p-2 font-mono text-xs">{p.eventType}</td>
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={p.email}
                    onChange={(e) => togglePref(p.eventType, "email", e.target.checked)}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={p.webhook}
                    onChange={(e) => togglePref(p.eventType, "webhook", e.target.checked)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void save()}>
          Save settings
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void testWebhook()}>
          Test webhook
        </Button>
      </div>
      {msg ? <p className="text-muted-foreground text-sm">{msg}</p> : null}
      <p className="text-muted-foreground text-xs">
        In-app notifications cannot be disabled. Email uses Resend when configured.
      </p>
    </div>
  );
}
