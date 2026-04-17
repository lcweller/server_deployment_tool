import { lt } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { hostAgentUpdateEvents } from "@/db/schema";

export const dynamic = "force-dynamic";

const DEFAULT_RETENTION_DAYS = 30;

function retentionDays(): number {
  const raw = process.env.AGENT_UPDATE_EVENT_RETENTION_DAYS?.trim();
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
 * Delete old agent self-update audit rows (see `host_agent_update_events`).
 * Schedule alongside other cron routes (Bearer `CRON_SECRET`).
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
    .delete(hostAgentUpdateEvents)
    .where(lt(hostAgentUpdateEvents.createdAt, cutoff))
    .returning({ id: hostAgentUpdateEvents.id });

  return NextResponse.json({
    deletedRows: deleted.length,
    retentionDays: days,
    cutoff: cutoff.toISOString(),
  });
}
