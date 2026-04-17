import { NextResponse } from "next/server";

import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";
import { tickScheduledBackups } from "@/lib/backup-schedule";

/**
 * Agent polls this to receive due scheduled backups (server creates run rows).
 */
export async function POST(request: Request) {
  const agent = await authenticateAgentApiKey(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const runs = await tickScheduledBackups(agent.host.id);
    return NextResponse.json({ ok: true, runs });
  } catch (e) {
    console.error("[backup-schedule]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Schedule tick failed" },
      { status: 500 }
    );
  }
}
