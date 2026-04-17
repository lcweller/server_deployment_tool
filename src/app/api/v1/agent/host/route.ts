import { NextResponse } from "next/server";

import { db } from "@/db";
import { hosts } from "@/db/schema";
import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";
import { eq } from "drizzle-orm";

/**
 * Current host row for the authenticated agent (removal + status).
 */
export async function GET(request: Request) {
  const agent = await authenticateAgentApiKey(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      id: hosts.id,
      name: hosts.name,
      status: hosts.status,
      steamUsername: hosts.steamUsername,
      updateMode: hosts.updateMode,
      platformOs: hosts.platformOs,
    })
    .from(hosts)
    .where(eq(hosts.id, agent.host.id))
    .limit(1);

  const h = rows[0];
  if (!h) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ host: h });
}
