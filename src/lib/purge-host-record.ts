import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { hostApiKeys, hosts, serverInstances } from "@/db/schema";

/**
 * Remove a host and its dashboard rows when the agent cannot finish removal
 * (offline machine, broken agent, etc.). Deletes game-server instance rows first
 * because `server_instances.host_id` uses ON DELETE SET NULL.
 */
export async function purgeHostRecord(hostId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(serverInstances).where(eq(serverInstances.hostId, hostId));
    await tx.delete(hostApiKeys).where(eq(hostApiKeys.hostId, hostId));
    await tx.delete(hosts).where(eq(hosts.id, hostId));
  });
}
