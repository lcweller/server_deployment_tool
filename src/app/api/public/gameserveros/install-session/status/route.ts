import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { gameserverosInstallSessions } from "@/db/schema";
import { hashSessionToken } from "@/lib/auth/session-token";

export const dynamic = "force-dynamic";

/**
 * Poll link status for the GameServerOS installer (Bearer = poll token from POST /install-session).
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const raw =
    auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  if (!raw) {
    return NextResponse.json({ error: "Missing poll token" }, { status: 401 });
  }

  const pollTokenHash = hashSessionToken(raw);
  const rows = await db
    .select({
      id: gameserverosInstallSessions.id,
      hostId: gameserverosInstallSessions.hostId,
      expiresAt: gameserverosInstallSessions.expiresAt,
    })
    .from(gameserverosInstallSessions)
    .where(eq(gameserverosInstallSessions.pollTokenHash, pollTokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ status: "expired" }, { status: 410 });
  }

  if (row.hostId != null) {
    return NextResponse.json({ status: "linked" });
  }

  return NextResponse.json({ status: "waiting" });
}
