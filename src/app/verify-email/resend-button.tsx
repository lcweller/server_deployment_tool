"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ResendVerificationButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);

  async function resend() {
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Failed to send.");
        return;
      }
      setStatus("done");
      setMessage("Another email is on the way.");
    } catch {
      setStatus("error");
      setMessage("Network error.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={status === "loading"}
        onClick={resend}
      >
        {status === "loading" ? "Sending…" : "Resend verification email"}
      </Button>
      {message ? (
        <p
          className={
            status === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
