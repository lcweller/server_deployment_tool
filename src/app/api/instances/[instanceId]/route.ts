import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import {
  catalogEntries,
  hosts,
  instanceLogLines,
  serverInstances,
} from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";
import { analyzeRecentLogLines } from "@/lib/log-insights";
import { isHostHeartbeatFresh } from "@/lib/host-presence";
import {
  notifyHostOwnerDashboard,
  notifyUserServersRealtime,
} from "@/lib/realtime/notify-dashboard";
import { sendControlToAgent } from "@/server/agent-socket-registry";

type RouteCtx = { params: Promise<{ instanceId: string }> };

/**
 * Single instance (for deploy progress polling).
 */
export async function GET(_request: Request, ctx: RouteCtx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { instanceId } = await ctx.params;

  const rows = await db
    .select({
      id: serverInstances.id,
      name: serverInstances.name,
      status: serverInstances.status,
      hostId: serverInstances.hostId,
      catalogEntryId: serverInstances.catalogEntryId,
      createdAt: serverInstances.createdAt,
      updatedAt: serverInstances.updatedAt,
      catalogName: catalogEntries.name,
      steamAppId: catalogEntries.steamAppId,
      hostName: hosts.name,
      provisionMessage: serverInstances.provisionMessage,
      lastError: serverInstances.lastError,
      allocatedPorts: serverInstances.allocatedPorts,
      hostMetrics: hosts.hostMetrics,
      hostLastSeenAt: hosts.lastSeenAt,
    })
    .from(serverInstances)
    .leftJoin(
      catalogEntries,
      eq(serverInstances.catalogEntryId, catalogEntries.id)
    )
    .leftJoin(hosts, eq(serverInstances.hostId, hosts.id))
    .where(
      and(
        eq(serverInstances.id, instanceId),
        eq(serverInstances.userId, auth.user.id)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { hostLastSeenAt, ...instanceRow } = row;
  const hostReachable = isHostHeartbeatFresh(hostLastSeenAt);

  const logRows = await db
    .select({ line: instanceLogLines.line })
    .from(instanceLogLines)
    .where(eq(instanceLogLines.instanceId, instanceId))
    .orderBy(desc(instanceLogLines.id))
    .limit(220);

  const logInsights = analyzeRecentLogLines(
    logRows.map((r) => r.line)
  );

  return NextResponse.json({
    instance: {
      ...instanceRow,
      hostReachable,
      logInsights: logInsights ?? undefined,
    },
  });
}

const powerBodySchema = z.object({
  power: z.enum(["stop", "start"]),
});

/**
 * Start or stop a server on the host (agent picks up `starting` / `stopping`).
 */
export async function PATCH(request: Request, ctx: RouteCtx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { instanceId } = await ctx.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = powerBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const rows = await db
    .select()
    .from(serverInstances)
    .where(
      and(
        eq(serverInstances.id, instanceId),
        eq(serverInstances.userId, auth.user.id)
      )
    )
    .limit(1);

  const inst = rows[0];
  if (!inst) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!inst.hostId) {
    return NextResponse.json(
      { error: "Assign this server to a host before changing power state." },
      { status: 409 }
    );
  }

  const [hostRow] = await db
    .select({ lastSeenAt: hosts.lastSeenAt })
    .from(hosts)
    .where(eq(hosts.id, inst.hostId))
    .limit(1);

  if (!isHostHeartbeatFresh(hostRow?.lastSeenAt)) {
    return NextResponse.json(
      {
        error:
          "This host has not sent a recent heartbeat (it may be powered off or unreachable). Start the machine or fix agent connectivity, then try again.",
        code: "HOST_OFFLINE",
      },
      { status: 409 }
    );
  }

  if (inst.status === "pending_delete") {
    return NextResponse.json(
      { error: "This server is being removed — power controls are disabled." },
      { status: 409 }
    );
  }

  const now = new Date();

  if (parsed.data.power === "stop") {
    if (inst.status !== "running" && inst.status !== "recovering") {
      return NextResponse.json(
        {
          error:
            "Only a running server (or one that is automatically restarting) can be stopped. Wait for deployment to finish, or refresh if it already stopped.",
        },
        { status: 409 }
      );
    }
    await db
      .update(serverInstances)
      .set({
        status: "stopping",
        provisionMessage:
          "Stop requested — your host will end the game process and close firewall and router mappings for this server.",
        lastError: null,
        updatedAt: now,
      })
      .where(eq(serverInstances.id, instanceId));

    notifyHostOwnerDashboard(auth.user.id, inst.hostId);
    sendControlToAgent(inst.hostId, {
      action: "instance_stop",
      instanceId,
    });

    return NextResponse.json({
      ok: true,
      instanceId,
      status: "stopping",
      message:
        "Your host will apply this within about one agent cycle (typically under a minute).",
    });
  }

  if (inst.status !== "stopped") {
    return NextResponse.json(
      {
        error:
          "Only a stopped server can be started again. Stop it first, or wait for the host to finish stopping.",
      },
      { status: 409 }
    );
  }

  await db
    .update(serverInstances)
    .set({
      status: "starting",
      provisionMessage:
        "Start requested — your host will launch the game server again using the files already on disk.",
      lastError: null,
      updatedAt: now,
    })
    .where(eq(serverInstances.id, instanceId));

  notifyHostOwnerDashboard(auth.user.id, inst.hostId);
  sendControlToAgent(inst.hostId, {
    action: "instance_start",
    instanceId,
  });

  return NextResponse.json({
    ok: true,
    instanceId,
    status: "starting",
    message:
      "Your host will bring the server online within about one agent cycle (typically under a minute).",
  });
}

/**
 * Request agent-side deletion (pending_delete).
 */
export async function DELETE(_request: Request, ctx: RouteCtx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { instanceId } = await ctx.params;

  const rows = await db
    .select()
    .from(serverInstances)
    .where(
      and(
        eq(serverInstances.id, instanceId),
        eq(serverInstances.userId, auth.user.id)
      )
    )
    .limit(1);

  const inst = rows[0];
  if (!inst) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (inst.status === "pending_delete") {
    return NextResponse.json({ ok: true, instanceId, alreadyQueued: true });
  }

  await db
    .update(serverInstances)
    .set({
      status: "pending_delete",
      updatedAt: new Date(),
    })
    .where(eq(serverInstances.id, instanceId));

  if (inst.hostId) {
    notifyHostOwnerDashboard(auth.user.id, inst.hostId);
    sendControlToAgent(inst.hostId, {
      action: "instance_delete",
      instanceId,
    });
  } else {
    notifyUserServersRealtime(auth.user.id);
  }

  return NextResponse.json({
    ok: true,
    instanceId,
    message:
      "Deletion queued. The host agent will stop processes, delete files, and remove this record.",
  });
}
