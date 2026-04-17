import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import {
  hostBackupDestinations,
  hostBackupPolicies,
  hostBackupRuns,
  hosts,
  serverInstances,
} from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";
import {
  createBackupRun,
  deleteBackupRunRow,
  listBackupRuns,
  listHostBackupDestinations,
  listHostBackupPolicies,
  upsertHostBackupPolicy,
} from "@/lib/backups";
import { nextScheduleSlotUTC } from "@/lib/backup-schedule";
import {
  BACKUP_UTC_HM_REGEX,
  BACKUP_UTC_WEEKLY_EXPR_REGEX,
} from "@/lib/backup-validation";
import { sendControlToAgent } from "@/server/agent-socket-registry";

type RouteCtx = { params: Promise<{ hostId: string }> };

async function instanceBelongsToHost(
  hostId: string,
  instanceId: string | null | undefined
): Promise<boolean> {
  if (!instanceId) return true;
  const rows = await db
    .select({ id: serverInstances.id })
    .from(serverInstances)
    .where(and(eq(serverInstances.id, instanceId), eq(serverInstances.hostId, hostId)))
    .limit(1);
  return Boolean(rows[0]);
}

const utcHm = z
  .string()
  .regex(BACKUP_UTC_HM_REGEX, "Use HH:mm (UTC), e.g. 02:30");

const utcWeeklyExpr = z
  .string()
  .regex(
    BACKUP_UTC_WEEKLY_EXPR_REGEX,
    "Use weekday:HH:mm (UTC), e.g. 1:02:00 for Monday 02:00"
  );

const destinationSchema = z
  .object({
    action: z.literal("upsert_destination"),
    id: z.string().uuid().optional(),
    kind: z.enum(["local", "s3", "sftp"]),
    name: z.string().min(1).max(120),
    config: z.record(z.string(), z.unknown()).default({}),
    enabled: z.boolean().default(true),
    updatePolicy: z.boolean().default(true),
    scheduleMode: z
      .enum(["manual", "daily", "hourly", "weekly", "custom"])
      .default("manual"),
    scheduleExpr: z.string().max(200).optional(),
    keepLast: z.number().int().min(1).max(1000).optional(),
    keepDays: z.number().int().min(1).max(3650).optional(),
    instanceId: z.union([z.string().uuid(), z.null()]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.updatePolicy) {
      if (data.scheduleMode === "daily") {
        const expr = data.scheduleExpr ?? "02:00";
        const r = utcHm.safeParse(expr);
        if (!r.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: r.error.issues[0]?.message ?? "Invalid daily schedule",
            path: ["scheduleExpr"],
          });
        }
      }
      if (data.scheduleMode === "weekly") {
        const expr = data.scheduleExpr ?? "1:02:00";
        const r = utcWeeklyExpr.safeParse(expr);
        if (!r.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: r.error.issues[0]?.message ?? "Invalid weekly schedule",
            path: ["scheduleExpr"],
          });
        }
      }
      if (data.scheduleMode !== "manual" && data.scheduleMode !== "custom") {
        if (data.instanceId == null || data.instanceId === "") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Pick a game server instance for scheduled backups.",
            path: ["instanceId"],
          });
        }
      }
    }
    if (data.kind === "s3") {
      const c = data.config as Record<string, unknown>;
      if (typeof c.bucket !== "string" || !String(c.bucket).trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "S3 bucket is required.",
          path: ["config"],
        });
      }
    }
    if (data.kind === "sftp") {
      const c = data.config as Record<string, unknown>;
      if (typeof c.host !== "string" || !String(c.host).trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "SFTP host is required.",
          path: ["config"],
        });
      }
    }
  });

const triggerSchema = z.object({
  action: z.enum(["trigger_backup", "trigger_restore"]),
  instanceId: z.string().uuid(),
  destinationId: z.string().uuid(),
  backupPath: z.string().optional(),
});

const testSchema = z.object({
  action: z.literal("test_destination"),
  kind: z.enum(["local", "s3", "sftp"]),
  name: z.string().min(1).max(120).default("Test destination"),
  config: z.record(z.string(), z.unknown()).default({}),
});

const deleteDestinationSchema = z.object({
  action: z.literal("delete_destination"),
  destinationId: z.string().uuid(),
});

const deletePolicySchema = z.object({
  action: z.literal("delete_policy"),
  policyId: z.string().uuid(),
});

const setPolicyEnabledSchema = z.object({
  action: z.literal("set_policy_enabled"),
  policyId: z.string().uuid(),
  enabled: z.boolean(),
});

const setDestinationEnabledSchema = z.object({
  action: z.literal("set_destination_enabled"),
  destinationId: z.string().uuid(),
  enabled: z.boolean(),
});

const upsertPolicySchema = z
  .object({
    action: z.literal("upsert_policy"),
    policyId: z.string().uuid().optional(),
    destinationId: z.string().uuid(),
    instanceId: z.union([z.string().uuid(), z.null()]).optional(),
    scheduleMode: z
      .enum(["manual", "daily", "hourly", "weekly", "custom"])
      .default("manual"),
    scheduleExpr: z.string().max(200).optional(),
    keepLast: z.number().int().min(1).max(1000).optional(),
    keepDays: z.number().int().min(1).max(3650).optional(),
    enabled: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.scheduleMode === "daily") {
      const expr = data.scheduleExpr ?? "02:00";
      const r = utcHm.safeParse(expr);
      if (!r.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: r.error.issues[0]?.message ?? "Invalid daily schedule",
          path: ["scheduleExpr"],
        });
      }
    }
    if (data.scheduleMode === "weekly") {
      const expr = data.scheduleExpr ?? "1:02:00";
      const r = utcWeeklyExpr.safeParse(expr);
      if (!r.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: r.error.issues[0]?.message ?? "Invalid weekly schedule",
          path: ["scheduleExpr"],
        });
      }
    }
    if (data.scheduleMode !== "manual" && data.scheduleMode !== "custom") {
      if (data.instanceId == null || data.instanceId === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pick a game server instance for scheduled backups.",
          path: ["instanceId"],
        });
      }
    }
  });

export async function GET(_request: Request, ctx: RouteCtx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) return auth.error;
  const { hostId } = await ctx.params;
  const hostRows = await db
    .select({ id: hosts.id })
    .from(hosts)
    .where(and(eq(hosts.id, hostId), eq(hosts.userId, auth.user.id)))
    .limit(1);
  if (!hostRows[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const destinations = await listHostBackupDestinations(hostId);
  const policies = await listHostBackupPolicies(hostId);
  const runs = await listBackupRuns(hostId, 30);
  const now = new Date();
  const policiesWithSchedule = policies.map((p) => {
    const next =
      p.enabled &&
      ["hourly", "daily", "weekly"].includes(p.scheduleMode) &&
      p.instanceId
        ? nextScheduleSlotUTC(now, p.scheduleMode, p.scheduleExpr)
        : null;
    return {
      ...p,
      nextScheduledAt: next ? next.toISOString() : null,
    };
  });
  return NextResponse.json({
    destinations,
    policies: policiesWithSchedule,
    runs,
  });
}

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) return auth.error;
  const { hostId } = await ctx.params;
  const hostRows = await db
    .select({ id: hosts.id })
    .from(hosts)
    .where(and(eq(hosts.id, hostId), eq(hosts.userId, auth.user.id)))
    .limit(1);
  if (!hostRows[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const d = destinationSchema.safeParse(json);
  if (
    json &&
    typeof json === "object" &&
    (json as { action?: string }).action === "upsert_destination" &&
    !d.success
  ) {
    return NextResponse.json(
      {
        error: d.error.issues[0]?.message ?? "Invalid destination payload",
      },
      { status: 400 }
    );
  }
  if (d.success) {
    const body = d.data;
    if (
      body.updatePolicy &&
      !(await instanceBelongsToHost(hostId, body.instanceId ?? null))
    ) {
      return NextResponse.json(
        { error: "Selected instance does not belong to this host." },
        { status: 400 }
      );
    }
    const destinationId =
      body.id ??
      (
        await db
          .insert(hostBackupDestinations)
          .values({
            hostId,
            kind: body.kind,
            name: body.name,
            config: body.config,
            enabled: body.enabled,
          })
          .returning({ id: hostBackupDestinations.id })
      )[0].id;
    if (body.id) {
      await db
        .update(hostBackupDestinations)
        .set({
          kind: body.kind,
          name: body.name,
          config: body.config,
          enabled: body.enabled,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(hostBackupDestinations.id, body.id),
            eq(hostBackupDestinations.hostId, hostId)
          )
        );
    }
    if (body.updatePolicy) {
      await upsertHostBackupPolicy({
        hostId,
        destinationId,
        instanceId: body.instanceId ?? null,
        scheduleMode: body.scheduleMode,
        scheduleExpr: body.scheduleExpr ?? null,
        keepLast: body.keepLast ?? null,
        keepDays: body.keepDays ?? null,
        enabled: body.enabled,
      });
    }
    return NextResponse.json({ ok: true, destinationId });
  }

  const del = deleteDestinationSchema.safeParse(json);
  if (del.success) {
    const runRows = await db
      .select({ id: hostBackupRuns.id })
      .from(hostBackupRuns)
      .where(
        and(
          eq(hostBackupRuns.hostId, hostId),
          eq(hostBackupRuns.destinationId, del.data.destinationId),
          inArray(hostBackupRuns.status, ["queued", "running"])
        )
      )
      .limit(1);
    if (runRows[0]) {
      return NextResponse.json(
        {
          error:
            "Cannot delete destination while backup/restore runs are queued or running.",
        },
        { status: 409 }
      );
    }

    const deleted = await db
      .delete(hostBackupDestinations)
      .where(
        and(
          eq(hostBackupDestinations.id, del.data.destinationId),
          eq(hostBackupDestinations.hostId, hostId)
        )
      )
      .returning({ id: hostBackupDestinations.id });
    if (!deleted[0]) {
      return NextResponse.json({ error: "Destination not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  const delPolicy = deletePolicySchema.safeParse(json);
  if (delPolicy.success) {
    const policyRows = await db
      .select({
        id: hostBackupPolicies.id,
        destinationId: hostBackupPolicies.destinationId,
        instanceId: hostBackupPolicies.instanceId,
      })
      .from(hostBackupPolicies)
      .where(
        and(
          eq(hostBackupPolicies.id, delPolicy.data.policyId),
          eq(hostBackupPolicies.hostId, hostId)
        )
      )
      .limit(1);
    const policy = policyRows[0];
    if (!policy) {
      return NextResponse.json({ error: "Policy not found." }, { status: 404 });
    }

    const inflight = await db
      .select({ id: hostBackupRuns.id })
      .from(hostBackupRuns)
      .where(
        and(
          eq(hostBackupRuns.hostId, hostId),
          eq(hostBackupRuns.destinationId, policy.destinationId),
          policy.instanceId
            ? eq(hostBackupRuns.instanceId, policy.instanceId)
            : isNull(hostBackupRuns.instanceId),
          inArray(hostBackupRuns.status, ["queued", "running"])
        )
      )
      .limit(1);
    if (inflight[0]) {
      return NextResponse.json(
        {
          error:
            "Cannot delete policy while matching backup/restore runs are queued or running.",
        },
        { status: 409 }
      );
    }

    await db
      .delete(hostBackupPolicies)
      .where(
        and(
          eq(hostBackupPolicies.id, delPolicy.data.policyId),
          eq(hostBackupPolicies.hostId, hostId)
        )
      );
    return NextResponse.json({ ok: true });
  }

  const setEnabled = setPolicyEnabledSchema.safeParse(json);
  if (setEnabled.success) {
    const updated = await db
      .update(hostBackupPolicies)
      .set({ enabled: setEnabled.data.enabled, updatedAt: new Date() })
      .where(
        and(
          eq(hostBackupPolicies.id, setEnabled.data.policyId),
          eq(hostBackupPolicies.hostId, hostId)
        )
      )
      .returning({ id: hostBackupPolicies.id, enabled: hostBackupPolicies.enabled });
    if (!updated[0]) {
      return NextResponse.json({ error: "Policy not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, policy: updated[0] });
  }

  const setDestinationEnabled = setDestinationEnabledSchema.safeParse(json);
  if (setDestinationEnabled.success) {
    const updated = await db
      .update(hostBackupDestinations)
      .set({
        enabled: setDestinationEnabled.data.enabled,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(hostBackupDestinations.id, setDestinationEnabled.data.destinationId),
          eq(hostBackupDestinations.hostId, hostId)
        )
      )
      .returning({ id: hostBackupDestinations.id, enabled: hostBackupDestinations.enabled });
    if (!updated[0]) {
      return NextResponse.json({ error: "Destination not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, destination: updated[0] });
  }

  const upsertPolicy = upsertPolicySchema.safeParse(json);
  if (
    json &&
    typeof json === "object" &&
    (json as { action?: string }).action === "upsert_policy" &&
    !upsertPolicy.success
  ) {
    return NextResponse.json(
      {
        error: upsertPolicy.error.issues[0]?.message ?? "Invalid policy payload",
      },
      { status: 400 }
    );
  }
  if (upsertPolicy.success) {
    const body = upsertPolicy.data;
    if (!(await instanceBelongsToHost(hostId, body.instanceId ?? null))) {
      return NextResponse.json(
        { error: "Selected instance does not belong to this host." },
        { status: 400 }
      );
    }
    const dest = await db
      .select({ id: hostBackupDestinations.id, enabled: hostBackupDestinations.enabled })
      .from(hostBackupDestinations)
      .where(
        and(
          eq(hostBackupDestinations.id, body.destinationId),
          eq(hostBackupDestinations.hostId, hostId)
        )
      )
      .limit(1);
    if (!dest[0]) {
      return NextResponse.json({ error: "Destination not found." }, { status: 404 });
    }
    if (!dest[0].enabled) {
      return NextResponse.json(
        { error: "Destination is disabled. Enable it before saving policy changes." },
        { status: 409 }
      );
    }

    try {
      if (body.policyId) {
        const updated = await db
          .update(hostBackupPolicies)
          .set({
            destinationId: body.destinationId,
            instanceId: body.instanceId ?? null,
            scheduleMode: body.scheduleMode,
            scheduleExpr: body.scheduleExpr ?? null,
            keepLast: body.keepLast ?? null,
            keepDays: body.keepDays ?? null,
            enabled: body.enabled,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(hostBackupPolicies.id, body.policyId),
              eq(hostBackupPolicies.hostId, hostId)
            )
          )
          .returning({ id: hostBackupPolicies.id });
        if (!updated[0]) {
          return NextResponse.json({ error: "Policy not found." }, { status: 404 });
        }
        return NextResponse.json({ ok: true, policyId: updated[0].id });
      }

      const policyId = await upsertHostBackupPolicy({
        hostId,
        destinationId: body.destinationId,
        instanceId: body.instanceId ?? null,
        scheduleMode: body.scheduleMode,
        scheduleExpr: body.scheduleExpr ?? null,
        keepLast: body.keepLast ?? null,
        keepDays: body.keepDays ?? null,
        enabled: body.enabled,
      });
      return NextResponse.json({ ok: true, policyId });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save policy.";
      if (
        /host_backup_policies_dest_instance_uidx|duplicate key value/i.test(message)
      ) {
        return NextResponse.json(
          {
            error:
              "A policy already exists for that destination and instance combination.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const t = triggerSchema.safeParse(json);
  if (t.success) {
    const trigger = t.data;
    if (!(await instanceBelongsToHost(hostId, trigger.instanceId))) {
      return NextResponse.json(
        { error: "Selected instance does not belong to this host." },
        { status: 400 }
      );
    }
    const destRows = await db
      .select({
        id: hostBackupDestinations.id,
        kind: hostBackupDestinations.kind,
        name: hostBackupDestinations.name,
        config: hostBackupDestinations.config,
        enabled: hostBackupDestinations.enabled,
      })
      .from(hostBackupDestinations)
      .where(
        and(
          eq(hostBackupDestinations.id, trigger.destinationId),
          eq(hostBackupDestinations.hostId, hostId)
        )
      )
      .limit(1);
    if (!destRows[0]) {
      return NextResponse.json({ error: "Backup destination not found." }, { status: 404 });
    }
    if (!destRows[0].enabled) {
      return NextResponse.json(
        { error: "Backup destination is disabled." },
        { status: 409 }
      );
    }
    const runId = await createBackupRun({
      hostId,
      instanceId: trigger.instanceId,
      destinationId: trigger.destinationId,
      kind: trigger.action === "trigger_backup" ? "backup" : "restore",
      status: "queued",
      phase: "queued",
    });
    const exactPolicy = await db
      .select()
      .from(hostBackupPolicies)
      .where(
        and(
          eq(hostBackupPolicies.hostId, hostId),
          eq(hostBackupPolicies.destinationId, trigger.destinationId),
          eq(hostBackupPolicies.instanceId, trigger.instanceId)
        )
      )
      .limit(1);
    const fallbackPolicy = exactPolicy[0]
      ? []
      : await db
          .select()
          .from(hostBackupPolicies)
          .where(
            and(
              eq(hostBackupPolicies.hostId, hostId),
              eq(hostBackupPolicies.destinationId, trigger.destinationId),
              isNull(hostBackupPolicies.instanceId)
            )
          )
          .limit(1);
    const policyRow = exactPolicy[0] ?? fallbackPolicy[0];
    const mergedConfig: Record<string, unknown> = {
      ...(destRows[0].config as Record<string, unknown>),
    };
    if (policyRow?.keepLast != null) {
      mergedConfig.keepLast = policyRow.keepLast;
    }
    if (policyRow?.keepDays != null) {
      mergedConfig.keepDays = policyRow.keepDays;
    }
    const controlOk = sendControlToAgent(hostId, {
      action: trigger.action === "trigger_backup" ? "backup_run" : "backup_restore",
      runId,
      hostId,
      instanceId: trigger.instanceId,
      destinationId: destRows[0].id,
      destination: { ...destRows[0], config: mergedConfig },
      backupPath: trigger.backupPath,
    });
    if (!controlOk) {
      await deleteBackupRunRow(runId);
      return NextResponse.json(
        { error: "Agent is not connected over WebSocket." },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true, runId });
  }
  const test = testSchema.safeParse(json);
  if (test.success) {
    const controlOk = sendControlToAgent(hostId, {
      action: "backup_test",
      destination: {
        id: "test",
        kind: test.data.kind,
        name: test.data.name,
        config: test.data.config,
      },
    });
    if (!controlOk) {
      return NextResponse.json(
        { error: "Agent is not connected over WebSocket." },
        { status: 503 }
      );
    }
    return NextResponse.json({
      ok: true,
      message:
        "Test command sent to host. Check host logs/events for connection result.",
    });
  }
  return NextResponse.json({ error: "Invalid body" }, { status: 400 });
}

