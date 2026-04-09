import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { serverInstances } from "@/db/schema";
import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";

type RouteCtx = { params: Promise<{ instanceId: string }> };

/**
 * Agent finished on-disk cleanup — remove instance row (logs cascade).
 */
export async function POST(request: Request, ctx: RouteCtx) {
  const agent = await authenticateAgentApiKey(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { instanceId } = await ctx.params;

  const rows = await db
    .select()
    .from(serverInstances)
    .where(eq(serverInstances.id, instanceId))
    .limit(1);

  const inst = rows[0];
  if (!inst || inst.hostId !== agent.host.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (inst.status !== "pending_delete") {
    return NextResponse.json(
      { error: "Instance is not pending deletion" },
      { status: 400 }
    );
  }

  await db
    .delete(serverInstances)
    .where(
      and(
        eq(serverInstances.id, instanceId),
        eq(serverInstances.hostId, agent.host.id)
      )
    );

  return NextResponse.json({ ok: true, deleted: instanceId });
}
