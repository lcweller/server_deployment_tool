import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { serverInstances } from "@/db/schema";
import { notifyHostOwnerDashboard } from "@/lib/realtime/notify-dashboard";
import {
  notifyGameServerCrash,
  notifyGameServerFailed,
  recordUserNotification,
} from "@/lib/user-notifications";

const portsShape = z.object({
  game: z.number().int().min(1).max(65535).optional(),
  query: z.number().int().min(1).max(65535).optional(),
  rcon: z.number().int().min(1).max(65535).optional(),
});

export const agentInstanceStatusBodySchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("installing"),
    message: z.string().max(2000).optional(),
    allocatedPorts: portsShape.optional(),
  }),
  z.object({
    status: z.literal("running"),
    message: z.string().max(2000).optional(),
    allocatedPorts: portsShape.optional(),
  }),
  z.object({
    status: z.literal("failed"),
    message: z.string().min(1).max(8000),
    allocatedPorts: portsShape.optional(),
  }),
  z.object({
    status: z.literal("stopped"),
    message: z.string().max(8000).optional(),
    allocatedPorts: portsShape.optional(),
  }),
  z.object({
    status: z.literal("recovering"),
    message: z.string().max(8000).optional(),
    allocatedPorts: portsShape.optional(),
  }),
]);

type AgentHostIdentity = { id: string; userId: string };

export async function applyAgentInstanceStatus(
  host: AgentHostIdentity,
  instanceId: string,
  body: unknown
): Promise<{ ok: true; status: string } | { ok: false; error: string; status: number }> {
  const parsed = agentInstanceStatusBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed", status: 400 };
  }

  const rows = await db
    .select()
    .from(serverInstances)
    .where(eq(serverInstances.id, instanceId))
    .limit(1);

  const inst = rows[0];
  if (!inst || inst.hostId !== host.id) {
    return { ok: false, error: "Not found", status: 404 };
  }

  const cur = inst.status;
  const next = parsed.data.status;

  const allowed =
    (cur === "queued" && next === "installing") ||
    (cur === "registered" && next === "installing") ||
    (cur === "installing" && (next === "running" || next === "failed")) ||
    (cur === "failed" && next === "installing") ||
    (cur === "stopping" && next === "stopped") ||
    (cur === "starting" && (next === "running" || next === "failed")) ||
    (cur === "running" && (next === "recovering" || next === "failed")) ||
    (cur === "recovering" &&
      (next === "running" || next === "failed" || next === "recovering"));

  if (!allowed) {
    return {
      ok: false,
      error: `Invalid status transition: ${cur} → ${next}`,
      status: 400,
    };
  }

  const now = new Date();
  const portsPatch =
    parsed.data.allocatedPorts != null
      ? { allocatedPorts: parsed.data.allocatedPorts }
      : {};

  if (next === "failed") {
    await db
      .update(serverInstances)
      .set({
        status: "failed",
        lastError: parsed.data.message,
        provisionMessage: null,
        updatedAt: now,
        ...portsPatch,
      })
      .where(
        and(eq(serverInstances.id, instanceId), eq(serverInstances.hostId, host.id))
      );
  } else if (next === "stopped") {
    await db
      .update(serverInstances)
      .set({
        status: "stopped",
        lastError: null,
        provisionMessage: parsed.data.message ?? "Server stopped.",
        updatedAt: now,
        ...portsPatch,
      })
      .where(
        and(eq(serverInstances.id, instanceId), eq(serverInstances.hostId, host.id))
      );
  } else if (next === "installing") {
    await db
      .update(serverInstances)
      .set({
        status: "installing",
        lastError: null,
        provisionMessage: parsed.data.message ?? null,
        updatedAt: now,
        ...portsPatch,
      })
      .where(
        and(eq(serverInstances.id, instanceId), eq(serverInstances.hostId, host.id))
      );
  } else if (next === "recovering") {
    await db
      .update(serverInstances)
      .set({
        status: "recovering",
        lastError: null,
        provisionMessage:
          parsed.data.message ??
          "Steamline is automatically restarting the game process…",
        updatedAt: now,
        ...portsPatch,
      })
      .where(
        and(eq(serverInstances.id, instanceId), eq(serverInstances.hostId, host.id))
      );
  } else {
    await db
      .update(serverInstances)
      .set({
        status: "running",
        lastError: null,
        provisionMessage:
          parsed.data.message ?? "Provision completed successfully.",
        updatedAt: now,
        ...portsPatch,
      })
      .where(
        and(eq(serverInstances.id, instanceId), eq(serverInstances.hostId, host.id))
      );
  }

  notifyHostOwnerDashboard(host.userId, host.id);

  const instanceName = inst.name;

  if (next === "running" && cur !== "running") {
    const runningMsg =
      parsed.data.status === "running"
        ? parsed.data.message
        : undefined;
    void recordUserNotification({
      userId: host.userId,
      eventType: "game_server_start",
      severity: "info",
      title: `Game server started: ${instanceName}`,
      message:
        (typeof runningMsg === "string" ? runningMsg : undefined)?.slice(0, 4000) ??
        "The dedicated server is running.",
      linkHref: `/servers`,
      hostId: host.id,
      instanceId,
    });
  }

  if (cur === "stopping" && next === "stopped") {
    const stoppedMsg =
      parsed.data.status === "stopped" ? parsed.data.message : undefined;
    void recordUserNotification({
      userId: host.userId,
      eventType: "game_server_stop",
      severity: "info",
      title: `Game server stopped: ${instanceName}`,
      message:
        (typeof stoppedMsg === "string" ? stoppedMsg : undefined)?.slice(0, 4000) ??
        "The game server was stopped on the host.",
      linkHref: `/servers`,
      hostId: host.id,
      instanceId,
    });
  }

  if (cur === "running" && next === "recovering") {
    const recoveringMsg =
      parsed.data.status === "recovering" ? parsed.data.message : undefined;
    void recordUserNotification({
      userId: host.userId,
      eventType: "self_heal",
      severity: "warning",
      title: `Self-healing: ${instanceName}`,
      message:
        (typeof recoveringMsg === "string" ? recoveringMsg : undefined)?.slice(0, 4000) ??
        "Steamline detected an issue with the game process and is taking automatic recovery action.",
      linkHref: `/servers`,
      hostId: host.id,
      instanceId,
    });
  }

  if (next === "failed" && parsed.data.status === "failed") {
    const detail = parsed.data.message;
    const runtimeCrash = cur === "running" || cur === "recovering";
    if (runtimeCrash) {
      void notifyGameServerCrash(
        host.userId,
        host.id,
        instanceId,
        instanceName,
        detail
      );
    } else {
      void notifyGameServerFailed(
        host.userId,
        host.id,
        instanceId,
        instanceName,
        detail
      );
    }
  }
  return { ok: true, status: next };
}
