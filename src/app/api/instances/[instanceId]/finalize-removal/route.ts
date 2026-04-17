import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { serverInstances } from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";
import {
  notifyHostOwnerDashboard,
  notifyUserServersRealtime,
} from "@/lib/realtime/notify-dashboard";

type RouteCtx = { params: Promise<{ instanceId: string }> };

/**
 * Remove the control-plane row when deletion is stuck (agent offline or failed).
 * Files may remain on the host — operator should wipe `steamline-data/instances/<id>` manually if needed.
 */
export async function POST(_request: Request, ctx: RouteCtx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { instanceId } = await ctx.params;

  const rows = await db
    .select()
    .from(serverInstances)
    .where(
      and(
        eq(serverInstances.id, instanceId),
        eq(serverInstances.userId, auth.user.id)
      )
    )
    .limit(1);

  const inst = rows[0];
  if (!inst) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (inst.status !== "pending_delete") {
    return NextResponse.json(
      {
        error:
          "Only servers stuck in “deleting” (pending_delete) can be removed from the dashboard this way.",
      },
      { status: 400 }
    );
  }

  const hostIdBefore = inst.hostId;

  await db
    .delete(serverInstances)
    .where(
      and(
        eq(serverInstances.id, instanceId),
        eq(serverInstances.userId, auth.user.id)
      )
    );

  if (hostIdBefore) {
    notifyHostOwnerDashboard(auth.user.id, hostIdBefore);
  } else {
    notifyUserServersRealtime(auth.user.id);
  }

  return NextResponse.json({
    ok: true,
    removedInstanceId: instanceId,
    notice:
      "Record removed from Steamline. If the agent was offline, delete leftover files on the host under steamline-data/instances if you no longer need them.",
  });
}
