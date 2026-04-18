import { count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { hosts, serverInstances } from "@/db/schema";
import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";
import { purgeHostRecord } from "@/lib/purge-host-record";
import { notifyUserServersRealtime } from "@/lib/realtime/notify-dashboard";

/**
 * Agent finished wiping the machine — remove host and API keys (instances must be gone).
 */
export async function POST(request: Request) {
  const agent = await authenticateAgentApiKey(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hostId = agent.host.id;

  const [h] = await db
    .select()
    .from(hosts)
    .where(eq(hosts.id, hostId))
    .limit(1);

  if (!h || h.status !== "pending_removal") {
    return NextResponse.json(
      { error: "Host is not marked for removal" },
      { status: 400 }
    );
  }

  const [{ n }] = await db
    .select({ n: count() })
    .from(serverInstances)
    .where(eq(serverInstances.hostId, hostId));

  if (Number(n) > 0) {
    return NextResponse.json(
      {
        error:
          "Server instances must be purged before host removal (pending_delete cleared).",
        remainingInstances: n,
      },
      { status: 400 }
    );
  }

  notifyUserServersRealtime(h.userId);

  await purgeHostRecord(hostId);

  return NextResponse.json({ ok: true, removedHostId: hostId });
}
