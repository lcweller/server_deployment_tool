import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { hosts } from "@/db/schema";
import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";
import { notifyHostOwnerDashboard } from "@/lib/realtime/notify-dashboard";

/**
 * Agent acknowledges it will perform the requested reboot — clears the dashboard flag.
 */
export async function POST(request: Request) {
  const agent = await authenticateAgentApiKey(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .update(hosts)
    .set({ rebootRequestedAt: null })
    .where(eq(hosts.id, agent.host.id));

  notifyHostOwnerDashboard(agent.host.userId, agent.host.id);

  return NextResponse.json({ ok: true });
}
