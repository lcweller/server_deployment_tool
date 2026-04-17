import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { gameserverosInstallSessions, hosts } from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";
import { hashSessionToken } from "@/lib/auth/session-token";
import {
  GAMESERVEROS_HOST_PAIRING_TTL_MS,
} from "@/lib/gameserveros-install-session";
import {
  isValidPairingCodeFormat,
  normalizePairingCodeInput,
} from "@/lib/pairing-code";
import { notifyHostOwnerDashboard } from "@/lib/realtime/notify-dashboard";

const bodySchema = z.object({
  pairingCode: z.string().min(6).max(24),
  name: z.string().min(1).max(128),
});

/**
 * Link a GameServerOS install session to this account (pairing code shown on the machine).
 */
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

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const normalized = normalizePairingCodeInput(parsed.data.pairingCode.trim());
  if (!isValidPairingCodeFormat(normalized)) {
    return NextResponse.json(
      {
        error: "invalid_code",
        message:
          "That code does not look right. It should be eight letters and numbers with a dash in the middle, exactly as shown on your server screen.",
      },
      { status: 400 }
    );
  }

  const pairingCodeHash = hashSessionToken(normalized);
  const now = new Date();

  const sessionRows = await db
    .select()
    .from(gameserverosInstallSessions)
    .where(
      and(
        eq(gameserverosInstallSessions.pairingCodeHash, pairingCodeHash),
        isNull(gameserverosInstallSessions.hostId)
      )
    )
    .limit(1);

  const session = sessionRows[0];
  if (!session || session.expiresAt.getTime() <= now.getTime()) {
    return NextResponse.json(
      {
        error: "code_not_found",
        message:
          "We could not find that code, or it has expired. On your server screen, choose retry to get a fresh code, then try again here.",
      },
      { status: 404 }
    );
  }

  const name = parsed.data.name.trim();
  const pairingExpiresAt = new Date(Date.now() + GAMESERVEROS_HOST_PAIRING_TTL_MS);

  const out = await db.transaction(async (tx) => {
    const [host] = await tx
      .insert(hosts)
      .values({
        userId: auth.user.id,
        name,
        platformOs: "linux",
        status: "pending",
        pairingCodeHash,
        pairingExpiresAt,
      })
      .returning({ id: hosts.id });

    if (!host) {
      throw new Error("host insert failed");
    }

    await tx
      .update(gameserverosInstallSessions)
      .set({ hostId: host.id })
      .where(eq(gameserverosInstallSessions.id, session.id));

    return host;
  });

  notifyHostOwnerDashboard(auth.user.id, out.id);

  return NextResponse.json({
    host: { id: out.id, name },
    message: "Linked. Your server can finish enrolling in the background.",
  });
}
