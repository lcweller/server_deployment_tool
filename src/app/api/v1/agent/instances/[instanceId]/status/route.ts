import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { serverInstances } from "@/db/schema";
import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";

const portsShape = z.object({
  game: z.number().int().min(1).max(65535).optional(),
  query: z.number().int().min(1).max(65535).optional(),
  rcon: z.number().int().min(1).max(65535).optional(),
});

const bodySchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("installing"),
    message: z.string().max(2000).optional(),
    allocatedPorts: portsShape.optional(),
  }),
  z.object({
    status: z.literal("running"),
    message: z.string().max(2000).optional(),
    allocatedPorts: portsShape.optional(),
  }),
  z.object({
    status: z.literal("failed"),
    message: z.string().min(1).max(8000),
    allocatedPorts: portsShape.optional(),
  }),
  z.object({
    status: z.literal("stopped"),
    message: z.string().max(8000).optional(),
    allocatedPorts: portsShape.optional(),
  }),
  z.object({
    status: z.literal("recovering"),
    message: z.string().max(8000).optional(),
    allocatedPorts: portsShape.optional(),
  }),
]);

type RouteCtx = { params: Promise<{ instanceId: string }> };

/**
 * Agent reports provisioning progress (installing → running | failed).
 */
export async function POST(request: Request, ctx: RouteCtx) {
  const agent = await authenticateAgentApiKey(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { instanceId } = await ctx.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const rows = await db
    .select()
    .from(serverInstances)
    .where(eq(serverInstances.id, instanceId))
    .limit(1);

  const inst = rows[0];
  if (!inst || inst.hostId !== agent.host.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cur = inst.status;
  const next = parsed.data.status;

  const allowed =
    (cur === "queued" && next === "installing") ||
    (cur === "registered" && next === "installing") ||
    (cur === "installing" && (next === "running" || next === "failed")) ||
    (cur === "failed" && next === "installing") ||
    (cur === "stopping" && next === "stopped") ||
    (cur === "starting" && (next === "running" || next === "failed")) ||
    (cur === "running" && next === "recovering") ||
    (cur === "recovering" &&
      (next === "running" || next === "failed" || next === "recovering"));

  if (!allowed) {
    return NextResponse.json(
      {
        error: `Invalid status transition: ${cur} → ${next}`,
      },
      { status: 400 }
    );
  }

  const now = new Date();
  const portsPatch =
    parsed.data.allocatedPorts != null
      ? { allocatedPorts: parsed.data.allocatedPorts }
      : {};

  if (next === "failed") {
    await db
      .update(serverInstances)
      .set({
        status: "failed",
        lastError: parsed.data.message,
        provisionMessage: null,
        updatedAt: now,
        ...portsPatch,
      })
      .where(
        and(
          eq(serverInstances.id, instanceId),
          eq(serverInstances.hostId, agent.host.id)
        )
      );
  } else if (next === "stopped") {
    await db
      .update(serverInstances)
      .set({
        status: "stopped",
        lastError: null,
        provisionMessage: parsed.data.message ?? "Server stopped.",
        updatedAt: now,
        ...portsPatch,
      })
      .where(
        and(
          eq(serverInstances.id, instanceId),
          eq(serverInstances.hostId, agent.host.id)
        )
      );
  } else if (next === "installing") {
    await db
      .update(serverInstances)
      .set({
        status: "installing",
        lastError: null,
        provisionMessage: parsed.data.message ?? null,
        updatedAt: now,
        ...portsPatch,
      })
      .where(
        and(
          eq(serverInstances.id, instanceId),
          eq(serverInstances.hostId, agent.host.id)
        )
      );
  } else if (next === "recovering") {
    await db
      .update(serverInstances)
      .set({
        status: "recovering",
        lastError: null,
        provisionMessage:
          parsed.data.message ??
          "Steamline is automatically restarting the game process…",
        updatedAt: now,
        ...portsPatch,
      })
      .where(
        and(
          eq(serverInstances.id, instanceId),
          eq(serverInstances.hostId, agent.host.id)
        )
      );
  } else {
    await db
      .update(serverInstances)
      .set({
        status: "running",
        lastError: null,
        provisionMessage:
          parsed.data.message ?? "Provision completed successfully.",
        updatedAt: now,
        ...portsPatch,
      })
      .where(
        and(
          eq(serverInstances.id, instanceId),
          eq(serverInstances.hostId, agent.host.id)
        )
      );
  }

  return NextResponse.json({ ok: true, instanceId, status: next });
}
