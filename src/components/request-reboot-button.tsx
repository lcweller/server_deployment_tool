"use client";

import { Power } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  hostId: string;
  disabled?: boolean;
  className?: string;
};

export function RequestRebootButton({
  hostId,
  disabled,
  className,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onReboot() {
    const ok = window.confirm(
      "Request a reboot of this host? The agent will schedule it on the next heartbeat (usually within ~30 seconds). " +
        "Ensure `shutdown` is available to the agent user, or set STEAMLINE_REBOOT_CMD on the host."
    );
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}/request-reboot`, {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        alert(j.error ?? `Request failed (${res.status})`);
        return;
      }
      if (j.message) {
        alert(j.message);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      disabled={disabled || busy}
      onClick={onReboot}
    >
      <Power data-icon="inline-start" className="size-4" />
      Request reboot
    </Button>
  );
}
