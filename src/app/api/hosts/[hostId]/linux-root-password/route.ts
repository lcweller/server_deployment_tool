import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { hosts } from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";
import {
  decryptLinuxRootPassword,
  encryptLinuxRootPassword,
} from "@/lib/crypto/linux-root-password";
import { notifyHostOwnerDashboard } from "@/lib/realtime/notify-dashboard";

type RouteCtx = { params: Promise<{ hostId: string }> };

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reveal") }),
  z.object({ action: z.literal("rotate") }),
  z.object({
    action: z.literal("set"),
    password: z.string().min(12).max(512),
  }),
]);

export async function GET(_request: Request, ctx: RouteCtx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { hostId } = await ctx.params;

  const rows = await db
    .select({
      linuxRootPasswordEnc: hosts.linuxRootPasswordEnc,
      linuxRootPasswordPendingEnc: hosts.linuxRootPasswordPendingEnc,
      platformOs: hosts.platformOs,
    })
    .from(hosts)
    .where(and(eq(hosts.id, hostId), eq(hosts.userId, auth.user.id)))
    .limit(1);

  const h = rows[0];
  if (!h) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    platformOs: h.platformOs,
    hasPassword: Boolean(
      h.linuxRootPasswordEnc?.trim() || h.linuxRootPasswordPendingEnc?.trim()
    ),
    deliveryPending: Boolean(h.linuxRootPasswordPendingEnc?.trim()),
  });
}

/**
 * reveal — return decrypted password (HTTPS only; do not log).
 * rotate — queue a random password for the agent on the next heartbeat.
 * set — queue a chosen password for the agent on the next heartbeat.
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

  if (host.platformOs !== "linux") {
    return NextResponse.json(
      { error: "Linux root password management applies only to Linux hosts." },
      { status: 400 }
    );
  }

  if (host.status === "pending") {
    return NextResponse.json(
      {
        error:
          "Host is not enrolled yet. Finish installation before managing the root password.",
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

  const parsed = actionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.action === "reveal") {
    const pendingEnc = host.linuxRootPasswordPendingEnc?.trim();
    const storedEnc = host.linuxRootPasswordEnc?.trim();
    const enc = pendingEnc ?? storedEnc;
    if (!enc) {
      return NextResponse.json(
        { error: "No root password stored for this host yet." },
        { status: 404 }
      );
    }
    try {
      const password = decryptLinuxRootPassword(enc);
      return NextResponse.json({
        password,
        ...(pendingEnc
          ? {
              note: "This is the password currently queued for the agent; it may not be applied on the machine yet.",
            }
          : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: "Could not decrypt stored password (server key changed?).", detail: msg },
        { status: 503 }
      );
    }
  }

  let plain: string;
  if (parsed.data.action === "rotate") {
    plain = randomBytes(24).toString("base64url");
  } else {
    plain = parsed.data.password;
  }

  let pendingEnc: string;
  try {
    pendingEnc = encryptLinuxRootPassword(plain);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  await db
    .update(hosts)
    .set({ linuxRootPasswordPendingEnc: pendingEnc })
    .where(eq(hosts.id, hostId));

  notifyHostOwnerDashboard(auth.user.id, hostId);

  if (parsed.data.action === "rotate") {
    return NextResponse.json({
      ok: true,
      password: plain,
      message:
        "This random password is queued for the host. It will be applied after the next agent heartbeat. Copy it now — you can reveal the stored password again from this page once the agent has applied it.",
    });
  }

  return NextResponse.json({
    ok: true,
    message:
      "The new root password was queued. It will be applied on the host after the next agent heartbeat.",
  });
}
