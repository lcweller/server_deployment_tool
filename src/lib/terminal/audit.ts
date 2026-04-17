import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { hostTerminalSessions } from "@/db/schema";

export async function insertTerminalAuditOpen(args: {
  hostId: string;
  userId: string;
}): Promise<string> {
  const [row] = await db
    .insert(hostTerminalSessions)
    .values({
      hostId: args.hostId,
      userId: args.userId,
    })
    .returning({ id: hostTerminalSessions.id });
  return row!.id;
}

export async function markTerminalAuditClosed(id: string): Promise<void> {
  await db
    .update(hostTerminalSessions)
    .set({ endedAt: new Date() })
    .where(eq(hostTerminalSessions.id, id));
}
