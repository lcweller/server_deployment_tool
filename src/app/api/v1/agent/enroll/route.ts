import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { hostApiKeys, hosts } from "@/db/schema";
import { publishHostRealtime } from "@/lib/realtime/host-updates";
import { recordUserNotification } from "@/lib/user-notifications";
import {
  isValidPairingCodeFormat,
  normalizePairingCodeInput,
} from "@/lib/pairing-code";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/session-token";

const baseFields = z.object({
  agentVersion: z.string().max(64).optional(),
  /** Stable id for this OS instance — blocks a second enroll from the same machine for the same account. */
  machineFingerprint: z.string().min(8).max(256).optional(),
});

const bodySchema = z
  .object({
    enrollmentToken: z.string().min(10).optional(),
    pairingCode: z.string().min(6).max(24).optional(),
  })
  .merge(baseFields)
  .refine(
    (d) =>
      Boolean(d.enrollmentToken?.trim()) !== Boolean(d.pairingCode?.trim()),
    { message: "Provide exactly one of enrollmentToken or pairingCode" }
  );

/**
 * Exchange a one-time enrollment token **or** a pairing code for a long-lived API key.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const fp = data.machineFingerprint?.trim() ?? null;

  let host: (typeof hosts.$inferSelect) | undefined;

  if (data.enrollmentToken?.trim()) {
    const tokenHash = hashSessionToken(data.enrollmentToken.trim());
    const rows = await db
      .select()
      .from(hosts)
      .where(eq(hosts.enrollmentTokenHash, tokenHash))
      .limit(1);
    host = rows[0];
    if (!host || host.status !== "pending") {
      return NextResponse.json(
        {
          error: "invalid_token",
          message:
            "This enrollment link is not valid or was already used. Open your dashboard, add the host again, and use the new command or pairing code.",
        },
        { status: 400 }
      );
    }
  } else {
    const normalized = normalizePairingCodeInput(data.pairingCode!.trim());
    if (!isValidPairingCodeFormat(normalized)) {
      return NextResponse.json(
        {
          error: "invalid_pairing_code",
          message:
            "That code does not look right. Use the eight-character code from your dashboard (letters and numbers only, with a dash in the middle).",
        },
        { status: 400 }
      );
    }
    const codeHash = hashSessionToken(normalized);
    const rows = await db
      .select()
      .from(hosts)
      .where(
        and(eq(hosts.pairingCodeHash, codeHash), eq(hosts.status, "pending"))
      )
      .limit(1);
    host = rows[0];
    if (!host) {
      return NextResponse.json(
        {
          error: "invalid_pairing_code",
          message:
            "We could not find that code. It may be wrong, already used, or replaced by a new code. Open your dashboard and create a fresh code from Add host.",
        },
        { status: 400 }
      );
    }
    if (
      !host.pairingExpiresAt ||
      host.pairingExpiresAt.getTime() <= Date.now()
    ) {
      return NextResponse.json(
        {
          error: "pairing_expired",
          message:
            "This pairing code has expired. Go to your dashboard, open Add host, and generate a new code.",
        },
        { status: 400 }
      );
    }
  }

  if (fp && fp.length >= 8) {
    const dup = await db
      .select({ id: hosts.id, name: hosts.name })
      .from(hosts)
      .where(
        and(
          eq(hosts.userId, host!.userId),
          eq(hosts.machineFingerprint, fp),
          ne(hosts.id, host!.id)
        )
      )
      .limit(1);

    if (dup[0]) {
      return NextResponse.json(
        {
          error: "duplicate_machine",
          message: `This machine is already enrolled as “${dup[0].name}”. Remove that host from the dashboard (Remove host), or delete ~/.steamline on the server if you removed the host already — then add a new host and enroll again.`,
          existingHostId: dup[0].id,
        },
        { status: 409 }
      );
    }
  }

  const apiPlain = generateSessionToken();
  const apiHash = hashSessionToken(apiPlain);

  try {
    await db.transaction(async (tx) => {
      await tx.insert(hostApiKeys).values({
        hostId: host!.id,
        keyHash: apiHash,
        label: "default",
      });

      await tx
        .update(hosts)
        .set({
          enrollmentTokenHash: null,
          pairingCodeHash: null,
          pairingExpiresAt: null,
          status: "online",
          agentVersion: data.agentVersion ?? null,
          lastSeenAt: new Date(),
          ...(fp && fp.length >= 8 ? { machineFingerprint: fp } : {}),
        })
        .where(eq(hosts.id, host!.id));
    });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (
      err?.code === "23505" ||
      (typeof err?.message === "string" &&
        (err.message.includes("duplicate key") ||
          err.message.includes("hosts_user_machine_fingerprint")))
    ) {
      return NextResponse.json(
        {
          error: "duplicate_machine",
          message:
            "This machine fingerprint is already tied to another host on your account. Remove that host in the dashboard first, or use STEAMLINE_ALLOW_DUPLICATE_ENROLL=1 only after deleting ~/.steamline.",
        },
        { status: 409 }
      );
    }
    throw e;
  }

  publishHostRealtime(host!.userId, {
    hostId: host!.id,
    kind: "heartbeat",
  });

  void recordUserNotification({
    userId: host!.userId,
    eventType: "enrollment_complete",
    severity: "info",
    title: `Host enrolled: ${host!.name}`,
    message:
      "This machine paired successfully and can run Steamline. Open the host page to deploy servers.",
    linkHref: `/hosts/${host!.id}`,
    hostId: host!.id,
  });

  return NextResponse.json({
    hostId: host!.id,
    /** Bearer token for subsequent agent calls — save to disk once. */
    apiKey: apiPlain,
  });
}
