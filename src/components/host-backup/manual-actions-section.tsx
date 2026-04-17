"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { HOST_BACKUP_SELECT_CLASS } from "./constants";
import type { DestinationRow, InstanceOpt } from "./types";

type Props = {
  busy: boolean;
  hostReachable: boolean;
  instances: InstanceOpt[];
  destinations: DestinationRow[];
  manualInstanceId: string;
  setManualInstanceId: (v: string) => void;
  manualDestId: string;
  setManualDestId: (v: string) => void;
  restorePath: string;
  setRestorePath: (v: string) => void;
  onBackup: () => void | Promise<void>;
  onRestore: () => void | Promise<void>;
};

export function HostBackupManualActionsSection({
  busy,
  hostReachable,
  instances,
  destinations,
  manualInstanceId,
  setManualInstanceId,
  manualDestId,
  setManualDestId,
  restorePath,
  setRestorePath,
  onBackup,
  onRestore,
}: Props) {
  const selectClass = HOST_BACKUP_SELECT_CLASS;
  const manualDestDisabled =
    Boolean(manualDestId) && !destinations.find((d) => d.id === manualDestId)?.enabled;

  return (
    <div className="space-y-3 rounded-md border border-border/60 p-3">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        Manual actions
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>Instance</Label>
          <select
            className={selectClass}
            value={manualInstanceId}
            onChange={(e) => setManualInstanceId(e.target.value)}
          >
            <option value="">—</option>
            {instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Destination</Label>
          <select
            className={selectClass}
            value={manualDestId}
            onChange={(e) => setManualDestId(e.target.value)}
          >
            <option value="">—</option>
            {destinations
              .filter((d) => d.enabled)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.kind})
                </option>
              ))}
          </select>
          {manualDestDisabled ? (
            <p className="text-amber-700 dark:text-amber-500 text-[11px]">
              Selected destination is disabled.
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label>Restore path / object key</Label>
          <Input
            value={restorePath}
            onChange={(e) => setRestorePath(e.target.value)}
            placeholder="For restore only"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || !hostReachable}
          onClick={() => void onBackup()}
        >
          Backup now
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || !hostReachable}
          onClick={() => void onRestore()}
        >
          Restore
        </Button>
      </div>
    </div>
  );
}
