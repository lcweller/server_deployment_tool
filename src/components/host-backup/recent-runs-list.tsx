"use client";

import type { RunRow } from "./types";

type Props = {
  hostId: string;
  runs: RunRow[];
  pathHints: Record<string, string>;
  onLoadBackupLocation: (runId: string) => void | Promise<void>;
  onDeleteRun: (runId: string) => void | Promise<void>;
};

export function HostBackupRecentRunsList({
  hostId,
  runs,
  pathHints,
  onLoadBackupLocation,
  onDeleteRun,
}: Props) {
  return (
    <div>
      <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
        Recent activity
      </p>
      {runs.length === 0 ? (
        <p className="text-muted-foreground text-xs">No backup events yet.</p>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-y-auto text-xs">
          {runs.map((r) => (
            <li
              key={r.id}
              className="border-border/40 flex flex-col gap-1 border-b pb-2 last:border-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {r.kind} · {r.status}
                </span>
                <span className="text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString()}
                </span>
              </div>
              {r.message ? <span className="text-muted-foreground">{r.message}</span> : null}
              {r.kind === "backup" && r.status === "done" && r.archivePath ? (
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap gap-2">
                    {r.destinationKind === "local" || r.destinationKind === "sftp" ? (
                      <button
                        type="button"
                        className="text-primary underline"
                        onClick={() => void onLoadBackupLocation(r.id)}
                      >
                        Path &amp; instructions
                      </button>
                    ) : (
                      <a
                        className="text-primary underline"
                        href={`/api/hosts/${hostId}/backups/runs/${r.id}/download`}
                      >
                        Download
                      </a>
                    )}
                    <button
                      type="button"
                      className="text-destructive underline"
                      onClick={() => void onDeleteRun(r.id)}
                    >
                      Delete
                    </button>
                  </div>
                  {pathHints[r.id] ? (
                    <pre className="bg-muted max-w-full overflow-x-auto rounded p-2 text-[11px] whitespace-pre-wrap">
                      {pathHints[r.id]}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
