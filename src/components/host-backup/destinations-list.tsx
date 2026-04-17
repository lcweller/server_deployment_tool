"use client";

import type { DestinationRow } from "./types";

type Props = {
  destinations: DestinationRow[];
  busy: boolean;
  onEdit: (destinationId: string) => void;
  onToggleEnabled: (destinationId: string, enabled: boolean) => void | Promise<void>;
  onDelete: (destinationId: string) => void | Promise<void>;
};

export function HostBackupDestinationsList({
  destinations,
  busy,
  onEdit,
  onToggleEnabled,
  onDelete,
}: Props) {
  if (destinations.length === 0) return null;

  return (
    <div>
      <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
        Destinations
      </p>
      <ul className="text-xs space-y-2">
        {destinations.map((d) => (
          <li
            key={d.id}
            className="border-border/50 flex items-center justify-between gap-3 border-b pb-2 last:border-0"
          >
            <span>
              <span className="font-medium">{d.name}</span>{" "}
              <span className="text-muted-foreground">({d.kind})</span>{" "}
              {!d.enabled ? (
                <span className="text-amber-700 dark:text-amber-500">disabled</span>
              ) : null}
            </span>
            <button
              type="button"
              className="underline disabled:opacity-50"
              disabled={busy}
              onClick={() => onEdit(d.id)}
            >
              Edit
            </button>
            <button
              type="button"
              className="underline disabled:opacity-50"
              disabled={busy}
              onClick={() => void onToggleEnabled(d.id, !d.enabled)}
            >
              {d.enabled ? "Disable" : "Enable"}
            </button>
            <button
              type="button"
              className="text-destructive underline disabled:opacity-50"
              disabled={busy}
              onClick={() => void onDelete(d.id)}
            >
              Delete destination
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
