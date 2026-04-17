import { and, eq, lt, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { hosts } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Clear expired pairing material for hosts still waiting on enrollment.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("token");

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const cleared = await db
    .update(hosts)
    .set({
      pairingCodeHash: null,
      pairingExpiresAt: null,
    })
    .where(
      and(
        eq(hosts.status, "pending"),
        isNotNull(hosts.pairingExpiresAt),
        lt(hosts.pairingExpiresAt, now)
      )
    )
    .returning({ id: hosts.id });

  return NextResponse.json({
    clearedHosts: cleared.length,
    at: now.toISOString(),
  });
}
