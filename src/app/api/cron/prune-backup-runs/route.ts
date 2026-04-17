import { lt } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { hostBackupRuns } from "@/db/schema";

export const dynamic = "force-dynamic";

const DEFAULT_RETENTION_DAYS = 365;

function retentionDays(): number {
  const raw = process.env.BACKUP_RUN_RETENTION_DAYS?.trim();
  if (!raw) {
    return DEFAULT_RETENTION_DAYS;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    return DEFAULT_RETENTION_DAYS;
  }
  return Math.min(3650, n);
}

/**
 * Deletes old `host_backup_runs` rows (audit/history). Does not remove objects
 * from S3 or on-disk files — those are governed by destination retention on the agent.
 * Schedule with Bearer `CRON_SECRET` like other prune routes.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("token");

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = retentionDays();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const deleted = await db
    .delete(hostBackupRuns)
    .where(lt(hostBackupRuns.createdAt, cutoff))
    .returning({ id: hostBackupRuns.id });

  return NextResponse.json({
    deletedRows: deleted.length,
    retentionDays: days,
    cutoff: cutoff.toISOString(),
  });
}
