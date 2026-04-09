"use client";

import { Turnstile } from "@marsidev/react-turnstile";

type Props = {
  onToken: (token: string) => void;
  onExpire?: () => void;
};

export function TurnstileField({ onToken, onExpire }: Props) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    return (
      <p className="text-xs text-muted-foreground">
        Captcha not configured (set{" "}
        <code className="rounded bg-muted px-1">NEXT_PUBLIC_TURNSTILE_SITE_KEY</code>{" "}
        for production).
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
