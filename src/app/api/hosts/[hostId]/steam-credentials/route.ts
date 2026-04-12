import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { hosts } from "@/db/schema";
import { encryptSteamHostSecretsPending } from "@/lib/crypto/steam-host-secrets";
import { requireVerifiedUser } from "@/lib/auth/require-verified";

type RouteCtx = { params: Promise<{ hostId: string }> };

const bodySchema = z.object({
  steamUsername: z.string().min(1).max(64).trim(),
  steamPassword: z.string().min(1).max(256),
  steamGuardCode: z.string().max(12).trim().optional(),
});

/**
 * Queue SteamCMD credentials for the enrolled agent: encrypted at rest, delivered once on the
 * next heartbeat over TLS, then removed from the database.
 */
export async function POST(request: Request, ctx: RouteCtx) {
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

  if (host.status === "pending") {
    return NextResponse.json(
      {
        error:
          "Host is not enrolled yet. Finish installation so the agent can receive credentials.",
      },
      { status: 409 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  let encrypted: string;
  try {
    encrypted = encryptSteamHostSecretsPending({
      steamUsername: parsed.data.steamUsername,
      steamPassword: parsed.data.steamPassword,
      ...(parsed.data.steamGuardCode && parsed.data.steamGuardCode.length > 0
        ? { steamGuardCode: parsed.data.steamGuardCode }
        : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  await db
    .update(hosts)
    .set({
      steamUsername: parsed.data.steamUsername,
      steamSecretsPending: encrypted,
    })
    .where(eq(hosts.id, hostId));

  return NextResponse.json({
    ok: true,
    message:
      "Credentials queued for this host. The agent will write them to steamline-agent.env on its next heartbeat (usually within a few seconds).",
  });
}
