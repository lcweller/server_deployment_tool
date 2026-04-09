"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function BillingActions({
  hasStripeCustomer,
}: {
  hasStripeCustomer: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function checkout() {
    setMsg(null);
    setLoading("checkout");
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        setMsg(data.error ?? "Checkout failed");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setMsg("No redirect URL returned.");
    } finally {
      setLoading(null);
    }
  }

  async function portal() {
    setMsg(null);
    setLoading("portal");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        setMsg(data.error ?? "Portal failed");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setMsg("No portal URL returned.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        disabled={loading !== null}
        onClick={checkout}
      >
        {loading === "checkout" ? "Redirecting…" : "Subscribe / checkout"}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={loading !== null || !hasStripeCustomer}
        onClick={portal}
      >
        {loading === "portal" ? "Opening…" : "Customer portal"}
      </Button>
      {msg ? (
        <p className="w-full text-sm text-destructive" role="alert">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
