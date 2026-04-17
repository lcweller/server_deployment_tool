import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { hosts } from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";
import { sendControlToAgent } from "@/server/agent-socket-registry";

type RouteCtx = { params: Promise<{ hostId: string }> };

const bodySchema = z.object({
  action: z.string().min(1).max(64),
  payload: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Send a control message to a connected agent over the WebSocket (e.g. ping).
 * REST fallback agents ignore this until they implement handlers.
 */
export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { hostId } = await ctx.params;

  const rows = await db
    .select({ id: hosts.id })
    .from(hosts)
    .where(and(eq(hosts.id, hostId), eq(hosts.userId, auth.user.id)))
    .limit(1);

  if (!rows[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  const ok = sendControlToAgent(hostId, {
    action: parsed.data.action,
    ...(parsed.data.payload ?? {}),
  });

  if (!ok) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "The agent is not connected over the real-time channel. It may be using REST fallback only, or the host is offline.",
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true });
}
