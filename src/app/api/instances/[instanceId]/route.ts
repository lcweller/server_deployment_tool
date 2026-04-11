import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { catalogEntries, hosts, serverInstances } from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";

type RouteCtx = { params: Promise<{ instanceId: string }> };

/**
 * Single instance (for deploy progress polling).
 */
export async function GET(_request: Request, ctx: RouteCtx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { instanceId } = await ctx.params;

  const rows = await db
    .select({
      id: serverInstances.id,
      name: serverInstances.name,
      status: serverInstances.status,
      hostId: serverInstances.hostId,
      catalogEntryId: serverInstances.catalogEntryId,
      createdAt: serverInstances.createdAt,
      updatedAt: serverInstances.updatedAt,
      catalogName: catalogEntries.name,
      steamAppId: catalogEntries.steamAppId,
      hostName: hosts.name,
      provisionMessage: serverInstances.provisionMessage,
      lastError: serverInstances.lastError,
      allocatedPorts: serverInstances.allocatedPorts,
    })
    .from(serverInstances)
    .leftJoin(
      catalogEntries,
      eq(serverInstances.catalogEntryId, catalogEntries.id)
    )
    .leftJoin(hosts, eq(serverInstances.hostId, hosts.id))
    .where(
      and(
        eq(serverInstances.id, instanceId),
        eq(serverInstances.userId, auth.user.id)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ instance: row });
}

/**
 * Request agent-side deletion (pending_delete).
 */
export async function DELETE(_request: Request, ctx: RouteCtx) {
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

  if (inst.status === "pending_delete") {
    return NextResponse.json({ ok: true, instanceId, alreadyQueued: true });
  }

  await db
    .update(serverInstances)
    .set({
      status: "pending_delete",
      updatedAt: new Date(),
    })
    .where(eq(serverInstances.id, instanceId));

  return NextResponse.json({
    ok: true,
    instanceId,
    message:
      "Deletion queued. The host agent will stop processes, delete files, and remove this record.",
  });
}
