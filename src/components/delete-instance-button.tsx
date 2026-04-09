"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  instanceId: string;
  instanceName: string;
  status: string;
  className?: string;
  size?: "default" | "sm" | "xs";
};

export function DeleteInstanceButton({
  instanceId,
  instanceName,
  status,
  className,
  size = "xs",
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (status === "pending_delete") {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        Deleting…
      </span>
    );
  }

  async function onDelete() {
    const ok = window.confirm(
      `Delete “${instanceName}”? The agent will stop the game process if it can, delete the instance files on the host, then remove this server from Steamline. This cannot be undone.`
    );
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/instances/${instanceId}`, {
        method: "DELETE",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? `Delete failed (${res.status})`);
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
      aria-label={`Delete server ${instanceName}`}
    >
      <Trash2 data-icon="inline-start" />
      Delete
    </Button>
  );
}
