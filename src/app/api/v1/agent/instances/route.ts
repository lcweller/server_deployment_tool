import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { catalogEntries, serverInstances } from "@/db/schema";
import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";

/**
 * List server instances assigned to this host (SteamCMD / lifecycle hooks use this).
 */
export async function GET(request: Request) {
  const agent = await authenticateAgentApiKey(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    .where(eq(serverInstances.hostId, agent.host.id))
    .orderBy(desc(serverInstances.updatedAt));

  return NextResponse.json({ instances: rows });
}
