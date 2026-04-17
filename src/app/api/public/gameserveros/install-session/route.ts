import { NextResponse } from "next/server";

import { db } from "@/db";
import { gameserverosInstallSessions } from "@/db/schema";
import { GAMESERVEROS_INSTALL_SESSION_TTL_MS } from "@/lib/gameserveros-install-session";
import { generatePairingCode } from "@/lib/pairing-code";
import { hashSessionToken } from "@/lib/auth/session-token";

export const dynamic = "force-dynamic";

const POLL_BYTES = 32;

function randomPollToken(): string {
  const a = new Uint8Array(POLL_BYTES);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Start a GameServerOS install session: returns a display pairing code and a secret poll token.
 * The installer shows the code; the operator claims it on the dashboard; the installer polls until linked.
 */
export async function POST() {
  const expiresAt = new Date(Date.now() + GAMESERVEROS_INSTALL_SESSION_TTL_MS);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const pairingCode = generatePairingCode();
    const pairingCodeHash = hashSessionToken(pairingCode);
    const pollToken = randomPollToken();
    const pollTokenHash = hashSessionToken(pollToken);

    try {
      await db.insert(gameserverosInstallSessions).values({
        pairingCodeHash,
        pollTokenHash,
        expiresAt,
      });
      return NextResponse.json({
        pairingCode,
        pollToken,
        expiresAt: expiresAt.toISOString(),
        ttlSeconds: Math.floor(GAMESERVEROS_INSTALL_SESSION_TTL_MS / 1000),
      });
    } catch {
      /* rare pairing_code_hash or poll_token_hash collision */
    }
  }

  return NextResponse.json(
    { error: "Could not allocate an install session. Please try again." },
    { status: 503 }
  );
}
