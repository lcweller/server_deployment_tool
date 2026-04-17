import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { hosts } from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";
import {
  generatePairingCode,
  pairingTtlMs,
} from "@/lib/pairing-code";
import { hashSessionToken } from "@/lib/auth/session-token";
import { notifyHostOwnerDashboard } from "@/lib/realtime/notify-dashboard";

type RouteCtx = { params: Promise<{ hostId: string }> };

/**
 * Create or rotate a pairing code for this pending host (shown in dashboard / GameServerOS).
 */
export async function POST(_request: Request, ctx: RouteCtx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { hostId } = await ctx.params;

  const rows = await db
    .select()
    .from(hosts)
    .where(and(eq(hosts.id, hostId), eq(hosts.userId, auth.user.id)))
    .limit(1);

  const host = rows[0];
  if (!host) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (host.status !== "pending") {
    return NextResponse.json(
      {
        error: "already_enrolled",
        message:
          "This host is already linked. Pairing codes are only used before the first connection.",
      },
      { status: 409 }
    );
  }

  const plain = generatePairingCode();
  const hash = hashSessionToken(plain);
  const expiresAt = new Date(Date.now() + pairingTtlMs());

  await db
    .update(hosts)
    .set({
      pairingCodeHash: hash,
      pairingExpiresAt: expiresAt,
    })
    .where(eq(hosts.id, hostId));

  notifyHostOwnerDashboard(auth.user.id, hostId);

  return NextResponse.json({
    pairingCode: plain,
    expiresAt: expiresAt.toISOString(),
    ttlSeconds: Math.floor(pairingTtlMs() / 1000),
  });
}
