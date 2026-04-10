"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  hostId: string;
  hostName: string;
  status: string;
  className?: string;
  size?: "default" | "sm" | "xs";
};

export function DeleteHostButton({
  hostId,
  hostName,
  status,
  className,
  size = "sm",
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (status === "pending_removal") {
    return (
      <span
        className={cn(
          "max-w-[min(100%,18rem)] text-xs leading-snug text-amber-700 dark:text-amber-400",
          className
        )}
      >
        Removal in progress — the agent deletes instances, wipes data, then
        unregisters this host. Keep the agent running until it disappears from
        your list.
      </span>
    );
  }

  async function onDelete() {
    const ok = window.confirm(
      `Remove host “${hostName}” from Steamline? All game servers on this machine will be queued for deletion. The agent will wipe installs, run STEAMLINE_UNINSTALL_SCRIPT if you configured one, delete the steamline-data folder, and unregister this host so the machine is left as if Steamline was never installed. This cannot be undone.`
    );
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/hosts/${hostId}`, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? `Remove host failed (${res.status})`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="destructive"
      size={size}
      className={className}
      disabled={busy}
      onClick={onDelete}
      aria-label={`Remove host ${hostName}`}
    >
      <Trash2 data-icon="inline-start" />
      Remove host
    </Button>
  );
}
