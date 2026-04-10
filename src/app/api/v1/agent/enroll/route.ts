import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { hostApiKeys, hosts } from "@/db/schema";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/session-token";

const bodySchema = z.object({
  enrollmentToken: z.string().min(10),
  agentVersion: z.string().max(64).optional(),
  /** Stable id for this OS instance — blocks a second enroll from the same machine for the same account. */
  machineFingerprint: z.string().min(8).max(256).optional(),
});

/**
 * Exchange a one-time enrollment token (from dashboard) for a long-lived API key.
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

  const tokenHash = hashSessionToken(parsed.data.enrollmentToken);

  const rows = await db
    .select()
    .from(hosts)
    .where(eq(hosts.enrollmentTokenHash, tokenHash))
    .limit(1);

  const host = rows[0];
  if (!host || host.status !== "pending") {
    return NextResponse.json(
      { error: "Invalid or already used enrollment token." },
      { status: 400 }
    );
  }

  const fp = parsed.data.machineFingerprint?.trim() ?? null;
  if (fp && fp.length >= 8) {
    const dup = await db
      .select({ id: hosts.id, name: hosts.name })
      .from(hosts)
      .where(
        and(
          eq(hosts.userId, host.userId),
          eq(hosts.machineFingerprint, fp),
          ne(hosts.id, host.id)
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
        hostId: host.id,
        keyHash: apiHash,
        label: "default",
      });

      await tx
        .update(hosts)
        .set({
          enrollmentTokenHash: null,
          status: "online",
          agentVersion: parsed.data.agentVersion ?? null,
          lastSeenAt: new Date(),
          ...(fp && fp.length >= 8 ? { machineFingerprint: fp } : {}),
        })
        .where(eq(hosts.id, host.id));
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

  return NextResponse.json({
    hostId: host.id,
    /** Bearer token for subsequent agent calls — save to disk once. */
    apiKey: apiPlain,
  });
}
