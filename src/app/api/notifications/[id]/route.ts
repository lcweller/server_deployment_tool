import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { userNotifications } from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }
  const { id } = await ctx.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const read =
    json && typeof json === "object" && "read" in json
      ? Boolean((json as { read?: boolean }).read)
      : true;

  const updated = await db
    .update(userNotifications)
    .set({ readAt: read ? new Date() : null })
    .where(and(eq(userNotifications.id, id), eq(userNotifications.userId, auth.user.id)))
    .returning({ id: userNotifications.id });

  if (!updated[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }
  const { id } = await ctx.params;
  const deleted = await db
    .delete(userNotifications)
    .where(and(eq(userNotifications.id, id), eq(userNotifications.userId, auth.user.id)))
    .returning({ id: userNotifications.id });
  if (!deleted[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
