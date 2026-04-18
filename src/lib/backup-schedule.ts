import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  hostBackupDestinations,
  hostBackupPolicies,
  hostBackupRuns,
  serverInstances,
} from "@/db/schema";

import { createBackupRun } from "@/lib/backups";

function lastHourlySlotUTC(now: Date): Date {
  const ms = 60 * 60 * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

function lastDailySlotUTC(now: Date, expr: string | null): Date {
  const [h, m] = (expr ?? "02:00").split(":").map((x) => Number(x));
  let slot = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0)
  );
  if (now < slot) {
    slot = new Date(slot.getTime() - 24 * 60 * 60 * 1000);
  }
  return slot;
}

/** `dow:HH:mm` UTC — dow 0 = Sunday */
function lastWeeklySlotUTC(now: Date, expr: string | null): Date {
  const raw = expr ?? "1:02:00";
  const parts = raw.split(":");
  const dow = Number(parts[0]);
  const hour = Number(parts[1]);
  const minute = Number(parts[2] ?? 0);
  const currentDow = now.getUTCDay();
  const diff = (currentDow - dow + 7) % 7;
  let slot = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - diff,
      hour,
      minute,
      0
    )
  );
  if (now < slot) {
    slot = new Date(slot.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return slot;
}

function lastScheduleSlotUTC(
  now: Date,
  mode: string,
  expr: string | null
): Date {
  if (mode === "hourly") {
    return lastHourlySlotUTC(now);
  }
  if (mode === "daily") {
    return lastDailySlotUTC(now, expr);
  }
  if (mode === "weekly") {
    return lastWeeklySlotUTC(now, expr);
  }
  return now;
}

function nextHourlySlotUTC(now: Date): Date {
  const ms = 60 * 60 * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms + ms);
}

/** Next calendar occurrence of HH:mm (UTC) strictly after `now`. */
function nextDailySlotUTC(now: Date, expr: string | null): Date {
  const [h, m] = (expr ?? "02:00").split(":").map((x) => Number(x));
  const safeH = Number.isFinite(h) ? h : 2;
  const safeM = Number.isFinite(m) ? m : 0;
  let candidate = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      safeH,
      safeM,
      0
    )
  );
  if (candidate <= now) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }
  return candidate;
}

/** Next `dow:HH:mm` UTC occurrence strictly after `now` (dow 0 = Sunday). */
function nextWeeklySlotUTC(now: Date, expr: string | null): Date {
  const raw = expr ?? "1:02:00";
  const parts = raw.split(":");
  const targetDow = Number(parts[0]);
  const hour = Number(parts[1]);
  const minute = Number(parts[2] ?? 0);
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const day = now.getUTCDate();
  for (let delta = 0; delta < 14; delta++) {
    const slot = new Date(Date.UTC(y, mo, day + delta, hour, minute, 0));
    if (slot.getUTCDay() !== targetDow) continue;
    if (slot > now) return slot;
  }
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
}

/**
 * Start of the next schedule window after `now` (UTC). Used for UI "next run" hints.
 * Returns null for manual/custom or unknown modes.
 */
export function nextScheduleSlotUTC(
  now: Date,
  mode: string,
  expr: string | null
): Date | null {
  if (mode === "hourly") {
    return nextHourlySlotUTC(now);
  }
  if (mode === "daily") {
    return nextDailySlotUTC(now, expr);
  }
  if (mode === "weekly") {
    return nextWeeklySlotUTC(now, expr);
  }
  return null;
}

async function lastSuccessfulBackupAt(args: {
  hostId: string;
  destinationId: string;
  instanceId: string | null;
}): Promise<Date | null> {
  const rows = await db
    .select({ createdAt: hostBackupRuns.createdAt })
    .from(hostBackupRuns)
    .where(
      and(
        eq(hostBackupRuns.hostId, args.hostId),
        eq(hostBackupRuns.destinationId, args.destinationId),
        eq(hostBackupRuns.kind, "backup"),
        eq(hostBackupRuns.status, "done"),
        args.instanceId
          ? eq(hostBackupRuns.instanceId, args.instanceId)
          : isNull(hostBackupRuns.instanceId)
      )
    )
    .orderBy(desc(hostBackupRuns.createdAt))
    .limit(1);
  return rows[0]?.createdAt ?? null;
}

async function hasInflightBackup(args: {
  hostId: string;
  destinationId: string;
  instanceId: string | null;
}): Promise<boolean> {
  const rows = await db
    .select({ id: hostBackupRuns.id })
    .from(hostBackupRuns)
    .where(
      and(
        eq(hostBackupRuns.hostId, args.hostId),
        eq(hostBackupRuns.destinationId, args.destinationId),
        eq(hostBackupRuns.kind, "backup"),
        inArray(hostBackupRuns.status, ["queued", "running"]),
        args.instanceId
          ? eq(hostBackupRuns.instanceId, args.instanceId)
          : isNull(hostBackupRuns.instanceId)
      )
    )
    .limit(1);
  return Boolean(rows[0]);
}

export type ScheduledBackupRunPayload = {
  runId: string;
  instanceId: string;
  destination: {
    id: string;
    kind: string;
    name: string;
    config: Record<string, unknown>;
  };
};

/**
 * Enqueue due scheduled backups for a host. Idempotent per schedule slot.
 */
export async function tickScheduledBackups(
  hostId: string
): Promise<ScheduledBackupRunPayload[]> {
  const now = new Date();
  const policies = await db
    .select()
    .from(hostBackupPolicies)
    .where(
      and(
        eq(hostBackupPolicies.hostId, hostId),
        eq(hostBackupPolicies.enabled, true)
      )
    );

  const out: ScheduledBackupRunPayload[] = [];

  for (const policy of policies) {
    const mode = policy.scheduleMode;
    if (mode === "manual" || mode === "custom") {
      continue;
    }
    if (!["hourly", "daily", "weekly"].includes(mode)) {
      continue;
    }

    const instanceId = policy.instanceId ?? null;
    if (instanceId) {
      const inst = await db
        .select({ status: serverInstances.status })
        .from(serverInstances)
        .where(
          and(
            eq(serverInstances.id, instanceId),
            eq(serverInstances.hostId, hostId)
          )
        )
        .limit(1);
      if (!inst[0] || inst[0].status !== "running") {
        continue;
      }
    }

    const lastSlot = lastScheduleSlotUTC(now, mode, policy.scheduleExpr);
    const lastOk = await lastSuccessfulBackupAt({
      hostId,
      destinationId: policy.destinationId,
      instanceId,
    });
    if (lastOk && lastOk >= lastSlot) {
      continue;
    }

    if (
      await hasInflightBackup({
        hostId,
        destinationId: policy.destinationId,
        instanceId,
      })
    ) {
      continue;
    }

    const dest = await db
      .select()
      .from(hostBackupDestinations)
      .where(
        and(
          eq(hostBackupDestinations.id, policy.destinationId),
          eq(hostBackupDestinations.hostId, hostId),
          eq(hostBackupDestinations.enabled, true)
        )
      )
      .limit(1);
    if (!dest[0]) {
      continue;
    }

    if (!instanceId) {
      continue;
    }

    const runId = await createBackupRun({
      hostId,
      instanceId,
      destinationId: policy.destinationId,
      kind: "backup",
      status: "queued",
      phase: "queued",
      message: `Scheduled (${mode})`,
    });

    await db
      .update(hostBackupPolicies)
      .set({ lastScheduledAt: now, updatedAt: now })
      .where(eq(hostBackupPolicies.id, policy.id));

    const mergedConfig: Record<string, unknown> = {
      ...(dest[0].config as Record<string, unknown>),
    };
    if (policy.keepLast != null) mergedConfig.keepLast = policy.keepLast;
    if (policy.keepDays != null) mergedConfig.keepDays = policy.keepDays;

    out.push({
      runId,
      instanceId,
      destination: {
        id: dest[0].id,
        kind: dest[0].kind,
        name: dest[0].name,
        config: mergedConfig,
      },
    });
  }

  return out;
}
