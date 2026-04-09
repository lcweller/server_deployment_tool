import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { hosts, serverInstances } from "@/db/schema";
import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";

const bodySchema = z.object({
  agentVersion: z.string().max(64).optional(),
});

export async function POST(request: Request) {
  const agent = await authenticateAgentApiKey(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown = {};
  try {
    const text = await request.text();
    if (text) {
      json = JSON.parse(text);
    }
  } catch {
    json = {};
  }

  const parsed = bodySchema.safeParse(json);
  const agentVersion = parsed.success ? parsed.data.agentVersion : undefined;

  await db
    .update(hosts)
    .set({
      lastSeenAt: new Date(),
      status: "online",
      ...(agentVersion ? { agentVersion } : {}),
    })
    .where(eq(hosts.id, agent.host.id));

  /** Legacy `draft` rows → `queued` once the host is talking to the API. */
  const promoted = await db
    .update(serverInstances)
    .set({ status: "queued", updatedAt: new Date() })
    .where(
      and(
        eq(serverInstances.hostId, agent.host.id),
        eq(serverInstances.status, "draft")
      )
    )
    .returning({ id: serverInstances.id });

  return NextResponse.json({
    ok: true,
    hostId: agent.host.id,
    promotedInstanceIds: promoted.map((r) => r.id),
  });
}
