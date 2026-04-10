"use client";

import { Turnstile } from "@marsidev/react-turnstile";
import { useEffect, useState } from "react";

type Props = {
  onToken: (token: string) => void;
  onExpire?: () => void;
};

export function TurnstileField({ onToken, onExpire }: Props) {
  const buildTimeSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [skipTurnstile, setSkipTurnstile] = useState<boolean | null>(null);
  const [runtimeSiteKey, setRuntimeSiteKey] = useState<string | null | undefined>(
    undefined
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/turnstile-config")
      .then((r) => r.json())
      .then((d: { skipTurnstile?: boolean; siteKey?: string | null }) => {
        if (!cancelled) {
          setSkipTurnstile(d.skipTurnstile === true);
          setRuntimeSiteKey(d.siteKey ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSkipTurnstile(false);
          setRuntimeSiteKey(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const siteKey = buildTimeSiteKey || runtimeSiteKey || null;

  if (skipTurnstile === null || runtimeSiteKey === undefined) {
    return (
      <p className="text-xs text-muted-foreground">Loading captcha settings…</p>
    );
  }

  if (skipTurnstile) {
    return (
      <p className="text-xs text-muted-foreground">
        Captcha is disabled for this deployment (
        <code className="rounded bg-muted px-1">STEAMLINE_SKIP_TURNSTILE</code>
        ). Use Cloudflare Turnstile keys in production when exposed to the internet.
      </p>
    );
  }

  if (!siteKey) {
    return (
      <p className="text-xs text-muted-foreground">
        Captcha not configured. Set container env{" "}
        <code className="rounded bg-muted px-1">TURNSTILE_SITE_KEY</code> and{" "}
        <code className="rounded bg-muted px-1">TURNSTILE_SECRET_KEY</code>, or{" "}
        <code className="rounded bg-muted px-1">STEAMLINE_SKIP_TURNSTILE=1</code> for
        private/LAN only.
      </p>
    );
  }

  return (
    <Turnstile
      siteKey={siteKey}
      onSuccess={onToken}
      onExpire={onExpire}
      options={{ theme: "dark", size: "flexible" }}
    />
  );
}
