import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { hosts, serverInstances } from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";
import { effectiveHostStatus } from "@/lib/host-presence";
import { purgeHostRecord } from "@/lib/purge-host-record";
import {
  notifyHostOwnerDashboard,
  notifyUserServersRealtime,
} from "@/lib/realtime/notify-dashboard";
import { sendControlToAgent } from "@/server/agent-socket-registry";

type RouteCtx = { params: Promise<{ hostId: string }> };

export async function DELETE(request: Request, ctx: RouteCtx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { hostId } = await ctx.params;
  const forceParam = new URL(request.url).searchParams.get("force");
  const force = forceParam === "1" || forceParam === "true";

  const rows = await db
    .select()
    .from(hosts)
    .where(and(eq(hosts.id, hostId), eq(hosts.userId, auth.user.id)))
    .limit(1);

  const host = rows[0];
  if (!host) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  /**
   * Agent will never call `removal-complete` if the machine is gone — drop the
   * dashboard rows so the user can enroll again. Does not wipe the remote disk.
   */
  if (host.status === "pending_removal" && force) {
    await purgeHostRecord(hostId);
    notifyUserServersRealtime(auth.user.id);
    return NextResponse.json({
      ok: true,
      hostId,
      removed: true,
      message:
        "Host removed from your account. If the machine still exists, delete ~/.steamline on it (or reinstall) before enrolling again.",
    });
  }

  if (host.status === "pending_removal") {
    return NextResponse.json({ ok: true, hostId, alreadyQueued: true });
  }

  await db
    .update(serverInstances)
    .set({ status: "pending_delete", updatedAt: new Date() })
    .where(eq(serverInstances.hostId, hostId));

  await db
    .update(hosts)
    .set({ status: "pending_removal" })
    .where(eq(hosts.id, hostId));

  notifyHostOwnerDashboard(auth.user.id, hostId);
  sendControlToAgent(hostId, { action: "instance_sync" });

  return NextResponse.json({
    ok: true,
    hostId,
    message:
      "Host removal queued. The agent will delete all game data, run STEAMLINE_UNINSTALL_SCRIPT if set, wipe steamline-data, then unregister this host.",
  });
}

export async function GET(_request: Request, ctx: RouteCtx) {
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

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ instanceTotal }] = await db
    .select({ instanceTotal: count() })
    .from(serverInstances)
    .where(eq(serverInstances.hostId, hostId));

  const [{ instancesPendingDelete }] = await db
    .select({ instancesPendingDelete: count() })
    .from(serverInstances)
    .where(
      and(
        eq(serverInstances.hostId, hostId),
        eq(serverInstances.status, "pending_delete")
      )
    );

  const {
    enrollmentTokenHash: _h,
    machineFingerprint: _mf,
    pairingCodeHash: _pch,
    ...rest
  } = row;
  const status = effectiveHostStatus({
    status: row.status,
    lastSeenAt: row.lastSeenAt,
  });
  const hasActivePairing =
    row.status === "pending" &&
    row.pairingCodeHash != null &&
    row.pairingExpiresAt != null &&
    row.pairingExpiresAt.getTime() > Date.now();

  return NextResponse.json({
    host: {
      ...rest,
      status,
      awaitingEnrollment: row.status === "pending",
      hasActivePairing,
      instanceTotal,
      instancesPendingDelete,
    },
  });
}

const patchHostBody = z
  .object({
    steamUsername: z.string().max(64).nullable().optional(),
  })
  .transform((data) => {
    const v = data.steamUsername;
    if (v === undefined) {
      return { steamUsername: undefined as string | null | undefined };
    }
    if (v === null) {
      return { steamUsername: null as string | null };
    }
    const t = v.trim();
    return { steamUsername: t.length === 0 ? null : t };
  });

export async function PATCH(request: Request, ctx: RouteCtx) {
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

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchHostBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.steamUsername === undefined) {
    return NextResponse.json(
      { error: "No updatable fields supplied (expected steamUsername)." },
      { status: 400 }
    );
  }

  await db
    .update(hosts)
    .set({
      steamUsername: parsed.data.steamUsername,
    })
    .where(eq(hosts.id, hostId));

  notifyHostOwnerDashboard(auth.user.id, hostId);

  return NextResponse.json({
    ok: true,
    hostId,
    steamUsername: parsed.data.steamUsername,
  });
}
