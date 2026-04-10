import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { hosts, serverInstances } from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";

type RouteCtx = { params: Promise<{ hostId: string }> };

export async function DELETE(_request: Request, ctx: RouteCtx) {
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

  if (host.status === "pending_removal") {
    return NextResponse.json({ ok: true, hostId, alreadyQueued: true });
  }

  await db
    .update(serverInstances)
    .set({ status: "pending_delete", updatedAt: new Date() })
    .where(eq(serverInstances.hostId, hostId));

  await db
    .update(hosts)
    .set({ status: "pending_removal" })
    .where(eq(hosts.id, hostId));

  return NextResponse.json({
    ok: true,
    hostId,
    message:
      "Host removal queued. The agent will delete all game data, run STEAMLINE_UNINSTALL_SCRIPT if set, wipe steamline-data, then unregister this host.",
  });
}

export async function GET(_request: Request, ctx: RouteCtx) {
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

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ instanceTotal }] = await db
    .select({ instanceTotal: count() })
    .from(serverInstances)
    .where(eq(serverInstances.hostId, hostId));

  const [{ instancesPendingDelete }] = await db
    .select({ instancesPendingDelete: count() })
    .from(serverInstances)
    .where(
      and(
        eq(serverInstances.hostId, hostId),
        eq(serverInstances.status, "pending_delete")
      )
    );

  const { enrollmentTokenHash: _h, ...rest } = row;
  return NextResponse.json({
    host: {
      ...rest,
      awaitingEnrollment: row.status === "pending",
      instanceTotal,
      instancesPendingDelete,
    },
  });
}
