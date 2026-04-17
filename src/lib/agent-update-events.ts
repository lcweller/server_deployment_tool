import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { hostAgentUpdateEvents } from "@/db/schema";

export type AgentUpdateEventRow = {
  id: string;
  phase: string;
  message: string | null;
  at: string;
};

function rowToDto(r: {
  id: string;
  phase: string;
  message: string | null;
  createdAt: Date;
}): AgentUpdateEventRow {
  return {
    id: r.id,
    phase: r.phase,
    message: r.message,
    at: r.createdAt.toISOString(),
  };
}

/**
 * Persist an `agent_update_event` from the agent WebSocket (best-effort).
 */
export async function insertHostAgentUpdateEvent(
  hostId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const phase =
    typeof payload.phase === "string" && payload.phase.length > 0
      ? payload.phase.slice(0, 128)
      : "unknown";
  let message: string | undefined;
  if (typeof payload.message === "string" && payload.message.length > 0) {
    message = payload.message.slice(0, 4000);
  }
  await db.insert(hostAgentUpdateEvents).values({
    hostId,
    phase,
    message: message ?? null,
  });
}

export async function listRecentHostAgentUpdateEvents(
  hostId: string,
  limit: number
): Promise<AgentUpdateEventRow[]> {
  const rows = await db
    .select({
      id: hostAgentUpdateEvents.id,
      phase: hostAgentUpdateEvents.phase,
      message: hostAgentUpdateEvents.message,
      createdAt: hostAgentUpdateEvents.createdAt,
    })
    .from(hostAgentUpdateEvents)
    .where(eq(hostAgentUpdateEvents.hostId, hostId))
    .orderBy(desc(hostAgentUpdateEvents.createdAt))
    .limit(Math.min(100, Math.max(1, limit)));

  return rows.map(rowToDto);
}
