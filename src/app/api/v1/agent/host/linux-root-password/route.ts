import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { hosts } from "@/db/schema";
import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";
import { notifyHostOwnerDashboard } from "@/lib/realtime/notify-dashboard";
import { encryptLinuxRootPassword } from "@/lib/crypto/linux-root-password";

const bodySchema = z.object({
  password: z.string().min(12).max(512),
});

/**
 * One-time report from the Linux install script after `chpasswd` (TLS in transit; encrypted at rest).
 */
export async function POST(request: Request) {
  const agent = await authenticateAgentApiKey(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  let enc: string;
  try {
    enc = encryptLinuxRootPassword(parsed.data.password);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  await db
    .update(hosts)
    .set({
      linuxRootPasswordEnc: enc,
      linuxRootPasswordPendingEnc: null,
    })
    .where(eq(hosts.id, agent.host.id));

  notifyHostOwnerDashboard(agent.host.userId, agent.host.id);

  return NextResponse.json({ ok: true });
}
