import { lt } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { gameserverosInstallSessions } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("token");

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const del = await db
    .delete(gameserverosInstallSessions)
    .where(lt(gameserverosInstallSessions.expiresAt, now))
    .returning({ id: gameserverosInstallSessions.id });

  return NextResponse.json({ pruned: del.length, at: now.toISOString() });
}
