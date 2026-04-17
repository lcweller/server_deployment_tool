import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { catalogEntries, serverInstances } from "@/db/schema";
import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";

/**
 * List server instances assigned to this host (SteamCMD / lifecycle hooks use this).
 * Optional `?instanceId=<uuid>` returns at most one row (cheaper for WebSocket-driven work).
 */
export async function GET(request: Request) {
  const agent = await authenticateAgentApiKey(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let instanceId: string | null = null;
  try {
    const u = new URL(request.url);
    const raw = u.searchParams.get("instanceId")?.trim();
    if (raw && /^[0-9a-f-]{36}$/i.test(raw)) {
      instanceId = raw;
    }
  } catch {
    /* ignore */
  }

  const rows = await db
    .select({
      id: serverInstances.id,
      name: serverInstances.name,
      status: serverInstances.status,
      catalogEntryId: serverInstances.catalogEntryId,
      steamAppId: catalogEntries.steamAppId,
      slug: catalogEntries.slug,
      template: catalogEntries.template,
      createdAt: serverInstances.createdAt,
      updatedAt: serverInstances.updatedAt,
      provisionMessage: serverInstances.provisionMessage,
      lastError: serverInstances.lastError,
      allocatedPorts: serverInstances.allocatedPorts,
    })
    .from(serverInstances)
    .leftJoin(
      catalogEntries,
      eq(serverInstances.catalogEntryId, catalogEntries.id)
    )
    .where(
      instanceId
        ? and(
            eq(serverInstances.hostId, agent.host.id),
            eq(serverInstances.id, instanceId)
          )
        : eq(serverInstances.hostId, agent.host.id)
    )
    .orderBy(desc(serverInstances.updatedAt));

  return NextResponse.json({ instances: rows });
}
