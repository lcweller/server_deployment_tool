"use client";

import type { DestinationRow, InstanceOpt, PolicyRow } from "./types";

type Props = {
  policies: PolicyRow[];
  destinations: DestinationRow[];
  instances: InstanceOpt[];
  busy: boolean;
  onEditPolicy: (policyId: string) => void;
  onSetPolicyEnabled: (policyId: string, enabled: boolean) => void | Promise<void>;
  onDeletePolicy: (policyId: string) => void | Promise<void>;
};

export function HostBackupPoliciesList({
  policies,
  destinations,
  instances,
  busy,
  onEditPolicy,
  onSetPolicyEnabled,
  onDeletePolicy,
}: Props) {
  if (policies.length === 0) return null;

  return (
    <div>
      <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
        Policies
      </p>
      <ul className="text-xs space-y-2">
        {policies.map((p) => {
          const dest = destinations.find((d) => d.id === p.destinationId);
          const destLabel = dest
            ? `${dest.name} (${dest.kind})`
            : `${p.destinationId.slice(0, 8)}…`;
          const inst = p.instanceId ? instances.find((i) => i.id === p.instanceId) : null;
          const instLabel = inst
            ? inst.name
            : p.instanceId
              ? `${p.instanceId.slice(0, 8)}…`
              : "—";
          const nextHint =
            p.nextScheduledAt && p.enabled
              ? `${new Date(p.nextScheduledAt).toLocaleString(undefined, {
                  timeZone: "UTC",
                  dateStyle: "medium",
                  timeStyle: "short",
                })} UTC`
              : null;
          const lastHint = p.lastScheduledAt
            ? `${new Date(p.lastScheduledAt).toLocaleString(undefined, {
                timeZone: "UTC",
                dateStyle: "short",
                timeStyle: "short",
              })} UTC`
            : null;

          const destMissing = !dest;
          const destDisabled = Boolean(dest && !dest.enabled);
          const canEditPolicy = Boolean(dest?.enabled);

          return (
            <li
              key={p.id}
              className="border-border/50 space-y-0.5 border-b pb-2 last:border-0"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{destLabel}</span>
                <span className="flex items-center gap-2">
                  {p.enabled ? null : <span className="text-muted-foreground">disabled</span>}
                  <button
                    type="button"
                    className="underline disabled:opacity-50"
                    disabled={busy || !canEditPolicy}
                    title={
                      destDisabled
                        ? "Enable the destination before editing this policy."
                        : destMissing
                          ? "Destination was removed."
                          : undefined
                    }
                    onClick={() => onEditPolicy(p.id)}
                  >
                    Edit policy
                  </button>
                  <button
                    type="button"
                    className="underline disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void onSetPolicyEnabled(p.id, !p.enabled)}
                  >
                    {p.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    className="text-destructive underline disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void onDeletePolicy(p.id)}
                  >
                    Delete policy
                  </button>
                </span>
              </div>
              {destMissing ? (
                <p className="text-amber-700 dark:text-amber-500">
                  Destination record is missing — delete this policy if it is orphaned.
                </p>
              ) : destDisabled ? (
                <p className="text-amber-700 dark:text-amber-500">
                  Destination is disabled — enable it to edit or run scheduled backups for this
                  policy.
                </p>
              ) : null}
              <div className="text-muted-foreground">
                <code className="text-[11px]">{p.scheduleMode}</code>
                {p.scheduleExpr ? (
                  <>
                    {" "}
                    <code className="text-[11px]">{p.scheduleExpr}</code>
                  </>
                ) : null}{" "}
                · instance {instLabel}
              </div>
              {nextHint ? (
                <div className="text-muted-foreground">Next window ≈ {nextHint}</div>
              ) : p.enabled && ["hourly", "daily", "weekly"].includes(p.scheduleMode) ? (
                <div className="text-amber-700 dark:text-amber-500">
                  Scheduled backups need a running instance selected on the policy.
                </div>
              ) : null}
              {lastHint ? (
                <div className="text-muted-foreground">Last enqueue {lastHint}</div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
