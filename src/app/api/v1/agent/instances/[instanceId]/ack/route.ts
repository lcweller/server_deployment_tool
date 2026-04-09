import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { serverInstances } from "@/db/schema";
import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";

type RouteCtx = { params: Promise<{ instanceId: string }> };

/**
 * Agent acknowledges it has synced an instance from the control plane (draft → queued).
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

  if (inst.status !== "draft") {
    return NextResponse.json({
      ok: true,
      instanceId: inst.id,
      status: inst.status,
      unchanged: true,
    });
  }

  await db
    .update(serverInstances)
    .set({
      status: "queued",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(serverInstances.id, instanceId),
        eq(serverInstances.hostId, agent.host.id)
      )
    );

  return NextResponse.json({
    ok: true,
    instanceId: inst.id,
    status: "queued",
  });
}
