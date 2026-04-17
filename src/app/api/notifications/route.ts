import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { userNotifications } from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";

export async function GET(request: Request) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }
  const u = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit")) || 40));
  const unreadOnly = u.searchParams.get("unread") === "1";

  const whereParts = [
    eq(userNotifications.userId, auth.user.id),
    ...(unreadOnly ? [isNull(userNotifications.readAt)] : []),
  ];
  const rows = await db
    .select()
    .from(userNotifications)
    .where(and(...whereParts))
    .orderBy(desc(userNotifications.createdAt))
    .limit(limit);

  const [countRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(userNotifications)
    .where(and(eq(userNotifications.userId, auth.user.id), isNull(userNotifications.readAt)));

  return NextResponse.json({
    notifications: rows,
    unreadCount: countRow?.c ?? 0,
  });
}

export async function POST(request: Request) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action =
    json && typeof json === "object" && "action" in json
      ? String((json as { action?: string }).action)
      : "";
  if (action !== "mark_all_read") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  await db
    .update(userNotifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(userNotifications.userId, auth.user.id), isNull(userNotifications.readAt))
    );

  return NextResponse.json({ ok: true });
}
