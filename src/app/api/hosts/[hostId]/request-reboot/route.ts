import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { hosts } from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";
import { notifyHostOwnerDashboard } from "@/lib/realtime/notify-dashboard";

type RouteCtx = { params: Promise<{ hostId: string }> };

/**
 * Queue a host reboot — the agent performs it on the next heartbeat (usually within ~30s).
 * Requires passwordless `shutdown` or set STEAMLINE_REBOOT_CMD on the host.
 */
export async function POST(_request: Request, ctx: RouteCtx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { hostId } = await ctx.params;

  const rows = await db
    .select()
    .from(hosts)
    .where(and(eq(hosts.id, hostId), eq(hosts.userId, auth.user.id)))
    .limit(1);

  const host = rows[0];
  if (!host) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (host.status === "pending" || host.status === "pending_removal") {
    return NextResponse.json(
      { error: "Host is not in a state that allows reboot requests." },
      { status: 400 }
    );
  }

  await db
    .update(hosts)
    .set({ rebootRequestedAt: new Date() })
    .where(eq(hosts.id, hostId));

  notifyHostOwnerDashboard(auth.user.id, hostId);

  return NextResponse.json({
    ok: true,
    message:
      "Reboot queued. The agent will schedule it on the next heartbeat (typically within ~30 seconds).",
  });
}
