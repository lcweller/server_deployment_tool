import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { hostApiKeys, hosts } from "@/db/schema";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/session-token";

const bodySchema = z.object({
  enrollmentToken: z.string().min(10),
  agentVersion: z.string().max(64).optional(),
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

  const apiPlain = generateSessionToken();
  const apiHash = hashSessionToken(apiPlain);

  await db.insert(hostApiKeys).values({
    hostId: host.id,
    keyHash: apiHash,
    label: "default",
  });

  await db
    .update(hosts)
    .set({
      enrollmentTokenHash: null,
      status: "online",
      agentVersion: parsed.data.agentVersion ?? null,
      lastSeenAt: new Date(),
    })
    .where(eq(hosts.id, host.id));

  return NextResponse.json({
    hostId: host.id,
    /** Bearer token for subsequent agent calls — save to disk once. */
    apiKey: apiPlain,
  });
}
