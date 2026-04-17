import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { hostApiKeys, hosts } from "@/db/schema";

import { hashSessionToken } from "./session-token";

export async function authenticateAgentApiKeyFromRawKey(
  rawKey: string | null | undefined
) {
  if (!rawKey?.trim()) {
    return null;
  }
  const raw = rawKey.trim();
  const keyHash = hashSessionToken(raw);
  const rows = await db
    .select({ key: hostApiKeys, host: hosts })
    .from(hostApiKeys)
    .innerJoin(hosts, eq(hostApiKeys.hostId, hosts.id))
    .where(eq(hostApiKeys.keyHash, keyHash))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  await db
    .update(hostApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(hostApiKeys.id, row.key.id));

  return { host: row.host, apiKeyId: row.key.id };
}

export async function authenticateAgentApiKey(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return null;
  }
  const raw = auth.slice(7).trim();
  return authenticateAgentApiKeyFromRawKey(raw);
}
