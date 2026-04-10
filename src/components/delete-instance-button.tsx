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
      <div className={cn("flex flex-col items-end gap-1", className)}>
        <span className="text-xs text-muted-foreground">Deleting…</span>
        <button
          type="button"
          className="text-[11px] text-amber-600 underline underline-offset-2 hover:text-amber-500 dark:text-amber-400"
          disabled={busy}
          onClick={async () => {
            const ok = window.confirm(
              `Remove “${instanceName}” from the dashboard only?\n\nUse this if deletion is stuck (agent offline). Game files may still exist on the host under steamline-data/instances — delete them manually if needed.`
            );
            if (!ok) {
              return;
            }
            setBusy(true);
            try {
              const res = await fetch(
                `/api/instances/${instanceId}/finalize-removal`,
                { method: "POST" }
              );
              const j = (await res.json().catch(() => ({}))) as {
                error?: string;
              };
              if (!res.ok) {
                alert(j.error ?? `Could not finalize (${res.status})`);
                return;
              }
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "…" : "Stuck? Remove from dashboard"}
        </button>
      </div>
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
