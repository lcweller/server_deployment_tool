import { and, eq, gte, isNotNull, lt, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { hosts, userNotifications } from "@/db/schema";
import { HOST_HEARTBEAT_MAX_AGE_MS } from "@/lib/host-presence";
import { recordUserNotification } from "@/lib/user-notifications";

export const dynamic = "force-dynamic";

/**
 * Emit host_offline when a host's last heartbeat is older than the staleness window.
 * Skips hosts that already have a host_offline notification for this downtime episode
 * (notification created after the last successful heartbeat timestamp).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("token");

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threshold = new Date(Date.now() - HOST_HEARTBEAT_MAX_AGE_MS);

  const rows = await db
    .select({
      id: hosts.id,
      userId: hosts.userId,
      name: hosts.name,
      lastSeenAt: hosts.lastSeenAt,
    })
    .from(hosts)
    .where(
      and(
        ne(hosts.status, "pending"),
        ne(hosts.status, "pending_removal"),
        isNotNull(hosts.lastSeenAt),
        lt(hosts.lastSeenAt, threshold)
      )
    );

  let notified = 0;
  for (const h of rows) {
    if (!h.lastSeenAt) {
      continue;
    }

    const already = await db
      .select({ id: userNotifications.id })
      .from(userNotifications)
      .where(
        and(
          eq(userNotifications.userId, h.userId),
          eq(userNotifications.hostId, h.id),
          eq(userNotifications.eventType, "host_offline"),
          gte(userNotifications.createdAt, h.lastSeenAt)
        )
      )
      .limit(1);

    if (already[0]) {
      continue;
    }

    await recordUserNotification({
      userId: h.userId,
      eventType: "host_offline",
      severity: "critical",
      title: `Host offline: ${h.name}`,
      message:
        "The Steamline agent has not sent a heartbeat recently — this host may be down, unreachable, or the agent may have stopped.",
      linkHref: `/hosts/${h.id}`,
      hostId: h.id,
    });
    notified += 1;
  }

  return NextResponse.json({
    scanned: rows.length,
    notified,
    at: new Date().toISOString(),
  });
}
