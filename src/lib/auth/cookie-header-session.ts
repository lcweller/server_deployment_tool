import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { sessions, users } from "@/db/schema";

import { SESSION_COOKIE } from "./constants";
import { hashSessionToken } from "./session-token";

/**
 * Resolve the logged-in user from a raw `Cookie` header (e.g. WebSocket upgrade).
 */
export async function getUserFromCookieHeader(
  cookieHeader: string | undefined | null
) {
  if (!cookieHeader?.trim()) {
    return null;
  }
  const match = new RegExp(
    `(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`
  ).exec(cookieHeader);
  if (!match?.[1]) {
    return null;
  }
  let token: string;
  try {
    token = decodeURIComponent(match[1]!.trim());
  } catch {
    return null;
  }
  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const rows = await db
    .select({
      user: users,
      session: sessions,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }
  if (row.session.expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id));
    return null;
  }
  return row.user;
}
