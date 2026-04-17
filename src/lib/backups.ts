import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  hostBackupDestinations,
  hostBackupPolicies,
  hostBackupRuns,
} from "@/db/schema";

export async function listHostBackupDestinations(hostId: string) {
  return db
    .select()
    .from(hostBackupDestinations)
    .where(eq(hostBackupDestinations.hostId, hostId))
    .orderBy(desc(hostBackupDestinations.updatedAt));
}

export async function upsertHostBackupPolicy(args: {
  hostId: string;
  destinationId: string;
  instanceId?: string | null;
  scheduleMode: string;
  scheduleExpr?: string | null;
  keepLast?: number | null;
  keepDays?: number | null;
  enabled?: boolean;
}) {
  const existing = await db
    .select({ id: hostBackupPolicies.id })
    .from(hostBackupPolicies)
    .where(
      and(
        eq(hostBackupPolicies.hostId, args.hostId),
        eq(hostBackupPolicies.destinationId, args.destinationId),
        args.instanceId
          ? eq(hostBackupPolicies.instanceId, args.instanceId)
          : isNull(hostBackupPolicies.instanceId)
      )
    )
    .limit(1);
  if (existing[0]) {
    await db
      .update(hostBackupPolicies)
      .set({
        scheduleMode: args.scheduleMode,
        scheduleExpr: args.scheduleExpr ?? null,
        keepLast: args.keepLast ?? null,
        keepDays: args.keepDays ?? null,
        enabled: args.enabled ?? true,
        instanceId: args.instanceId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(hostBackupPolicies.id, existing[0].id));
    return existing[0].id;
  }
  const [row] = await db
    .insert(hostBackupPolicies)
    .values({
      hostId: args.hostId,
      destinationId: args.destinationId,
      instanceId: args.instanceId ?? null,
      scheduleMode: args.scheduleMode,
      scheduleExpr: args.scheduleExpr ?? null,
      keepLast: args.keepLast ?? null,
      keepDays: args.keepDays ?? null,
      enabled: args.enabled ?? true,
    })
    .returning({ id: hostBackupPolicies.id });
  return row.id;
}

export async function createBackupRun(args: {
  hostId: string;
  kind: "backup" | "restore" | "test";
  instanceId?: string;
  destinationId?: string;
  status?: string;
  phase?: string;
  message?: string;
}) {
  const [row] = await db
    .insert(hostBackupRuns)
    .values({
      hostId: args.hostId,
      instanceId: args.instanceId ?? null,
      destinationId: args.destinationId ?? null,
      kind: args.kind,
      status: args.status ?? "queued",
      phase: args.phase ?? null,
      message: args.message ?? null,
    })
    .returning({ id: hostBackupRuns.id });
  return row.id;
}

export async function updateBackupRun(
  runId: string,
  patch: {
    status?: string;
    phase?: string | null;
    message?: string | null;
    archivePath?: string | null;
    checksumSha256?: string | null;
    sizeBytes?: number | null;
  }
) {
  await db
    .update(hostBackupRuns)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(hostBackupRuns.id, runId));
}

export async function listBackupRuns(hostId: string, limit = 50) {
  return db
    .select({
      id: hostBackupRuns.id,
      hostId: hostBackupRuns.hostId,
      instanceId: hostBackupRuns.instanceId,
      destinationId: hostBackupRuns.destinationId,
      kind: hostBackupRuns.kind,
      status: hostBackupRuns.status,
      phase: hostBackupRuns.phase,
      message: hostBackupRuns.message,
      archivePath: hostBackupRuns.archivePath,
      checksumSha256: hostBackupRuns.checksumSha256,
      sizeBytes: hostBackupRuns.sizeBytes,
      createdAt: hostBackupRuns.createdAt,
      updatedAt: hostBackupRuns.updatedAt,
      destinationKind: hostBackupDestinations.kind,
    })
    .from(hostBackupRuns)
    .leftJoin(
      hostBackupDestinations,
      eq(hostBackupRuns.destinationId, hostBackupDestinations.id)
    )
    .where(eq(hostBackupRuns.hostId, hostId))
    .orderBy(desc(hostBackupRuns.createdAt))
    .limit(Math.max(1, Math.min(200, limit)));
}

export async function getBackupRun(runId: string) {
  const rows = await db
    .select()
    .from(hostBackupRuns)
    .where(eq(hostBackupRuns.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteBackupRunRow(runId: string): Promise<void> {
  await db.delete(hostBackupRuns).where(eq(hostBackupRuns.id, runId));
}

export async function listHostBackupPolicies(hostId: string) {
  return db
    .select()
    .from(hostBackupPolicies)
    .where(eq(hostBackupPolicies.hostId, hostId))
    .orderBy(desc(hostBackupPolicies.updatedAt));
}

