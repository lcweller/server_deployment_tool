import "server-only";

import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  userNotificationEventPrefs,
  userNotifications,
  userNotificationSettings,
  users,
} from "@/db/schema";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { publishHostRealtime } from "@/lib/realtime/host-updates";

export const NOTIFICATION_EVENT_TYPES = [
  "host_offline",
  "host_online",
  "game_server_crash",
  "game_server_start",
  "game_server_stop",
  "game_server_fail",
  "disk_low_10",
  "disk_low_5",
  "agent_update_available",
  "agent_update_applied",
  "agent_update_failed",
  "agent_update_rollback",
  "os_update_available",
  "os_update_applied",
  "os_update_failed",
  "os_update_skipped",
  "backup_success",
  "backup_fail",
  "restore_success",
  "restore_fail",
  "enrollment_complete",
  "self_heal",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export type RecordNotificationInput = {
  userId: string;
  eventType: string;
  severity: "info" | "warning" | "error" | "critical";
  title: string;
  message: string;
  linkHref?: string | null;
  hostId?: string | null;
  instanceId?: string | null;
  /** Same key within dedup window merges into one row with higher count. */
  dedupeKey?: string | null;
};

async function getOrCreateSettings(userId: string) {
  const rows = await db
    .select()
    .from(userNotificationSettings)
    .where(eq(userNotificationSettings.userId, userId))
    .limit(1);
  if (rows[0]) {
    return rows[0];
  }
  await db.insert(userNotificationSettings).values({ userId });
  const again = await db
    .select()
    .from(userNotificationSettings)
    .where(eq(userNotificationSettings.userId, userId))
    .limit(1);
  return again[0]!;
}

export async function recordUserNotification(
  input: RecordNotificationInput
): Promise<void> {
  const settings = await getOrCreateSettings(input.userId);
  const dedupSec = settings.crashDedupSec ?? 600;
  const cooldownSec = settings.alertCooldownSec ?? 300;
  const dedupeKey =
    input.dedupeKey ??
    `${input.eventType}:${input.hostId ?? ""}:${input.instanceId ?? ""}`;

  const sinceDedup = new Date(Date.now() - dedupSec * 1000);
  const sinceCooldown = new Date(Date.now() - cooldownSec * 1000);

  if (dedupeKey && (input.eventType === "game_server_fail" || input.eventType === "game_server_crash")) {
    const recent = await db
      .select({ id: userNotifications.id, occurrenceCount: userNotifications.occurrenceCount })
      .from(userNotifications)
      .where(
        and(
          eq(userNotifications.userId, input.userId),
          eq(userNotifications.dedupeKey, dedupeKey),
          gte(userNotifications.createdAt, sinceDedup)
        )
      )
      .orderBy(desc(userNotifications.createdAt))
      .limit(1);
    const row = recent[0];
    if (row) {
      const nextCount = row.occurrenceCount + 1;
      await db
        .update(userNotifications)
        .set({
          occurrenceCount: nextCount,
          message: input.message,
          title: `${input.title.replace(/\s*\(\d+\)\s*$/, "")} (${nextCount}× in ${Math.round(dedupSec / 60)}m)`,
          severity: input.severity,
        })
        .where(eq(userNotifications.id, row.id));
      publishHostRealtime(input.userId, { hostId: input.hostId ?? "00000000-0000-0000-0000-000000000001", kind: "notifications" });
      await deliverExternalChannels(input.userId, input, settings);
      return;
    }
  }

  const cooldownRows = await db
    .select({ id: userNotifications.id })
    .from(userNotifications)
    .where(
      and(
        eq(userNotifications.userId, input.userId),
        eq(userNotifications.eventType, input.eventType),
        input.hostId
          ? eq(userNotifications.hostId, input.hostId)
          : isNull(userNotifications.hostId),
        gte(userNotifications.createdAt, sinceCooldown)
      )
    )
    .limit(1);
  if (
    cooldownRows[0] &&
    input.eventType !== "game_server_fail" &&
    input.eventType !== "game_server_crash"
  ) {
    return;
  }

  await db.insert(userNotifications).values({
    userId: input.userId,
    eventType: input.eventType,
    severity: input.severity,
    title: input.title,
    message: input.message,
    linkHref: input.linkHref ?? null,
    hostId: input.hostId ?? null,
    instanceId: input.instanceId ?? null,
    dedupeKey,
    occurrenceCount: 1,
  });

  publishHostRealtime(input.userId, {
    hostId: input.hostId ?? "00000000-0000-0000-0000-000000000001",
    kind: "notifications",
  });

  await deliverExternalChannels(input.userId, input, settings);
}

async function deliverExternalChannels(
  userId: string,
  input: RecordNotificationInput,
  settings: typeof userNotificationSettings.$inferSelect
): Promise<void> {
  const prefs = await db
    .select()
    .from(userNotificationEventPrefs)
    .where(
      and(
        eq(userNotificationEventPrefs.userId, userId),
        eq(userNotificationEventPrefs.eventType, input.eventType)
      )
    )
    .limit(1);
  const emailAllowed = prefs[0]?.email !== false;
  const webhookAllowed = prefs[0]?.webhook === true;

  const [userRow] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const email = userRow?.email;

  if (settings.emailEnabled && emailAllowed && email) {
    void sendTransactionalEmail(
      {
        to: email,
        subject: `[Steamline] ${input.title}`,
        text: `${input.message}\n\n${input.linkHref ?? ""}`,
      },
      { apiKey: settings.resendApiKey }
    );
  }

  if (settings.webhookEnabled && webhookAllowed && settings.webhookUrl?.trim()) {
    const body = {
      event: input.eventType,
      severity: input.severity,
      title: input.title,
      message: input.message,
      link: input.linkHref,
      hostId: input.hostId,
      instanceId: input.instanceId,
      at: new Date().toISOString(),
    };
    const sig = settings.webhookSecret?.trim();
    void fetch(settings.webhookUrl.trim(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sig ? { "X-Steamline-Signature": sig } : {}),
      },
      body: JSON.stringify(body),
    }).catch(() => {});
  }
}

export async function notifyGameServerFailed(
  userId: string,
  hostId: string,
  instanceId: string,
  instanceName: string,
  detail: string
): Promise<void> {
  await recordUserNotification({
    userId,
    eventType: "game_server_fail",
    severity: "error",
    title: `Game server failed: ${instanceName}`,
    message: detail.slice(0, 4000),
    linkHref: `/servers`,
    hostId,
    instanceId,
    dedupeKey: `fail:${hostId}:${instanceId}`,
  });
}

/** Runtime / watchdog failure after the server was running or recovering (not provision/start errors). */
export async function notifyGameServerCrash(
  userId: string,
  hostId: string,
  instanceId: string,
  instanceName: string,
  detail: string
): Promise<void> {
  await recordUserNotification({
    userId,
    eventType: "game_server_crash",
    severity: "error",
    title: `Game server crashed: ${instanceName}`,
    message: detail.slice(0, 4000),
    linkHref: `/servers`,
    hostId,
    instanceId,
    dedupeKey: `crash:${hostId}:${instanceId}`,
  });
}

/**
 * Maps persisted `agent_update_event` WebSocket payloads to user notifications.
 * Phases like downloading/installing are intentionally silent to avoid noise.
 */
export async function notifyFromAgentUpdateEvent(
  userId: string,
  hostId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const phase = typeof payload.phase === "string" ? payload.phase : "";
  const message =
    typeof payload.message === "string" ? payload.message.slice(0, 4000) : "";

  if (phase === "noop" || phase === "downloading" || phase === "verifying" || phase === "installing" || phase === "restarting") {
    return;
  }

  const linkHref = `/hosts/${hostId}`;

  if (phase === "checking") {
    const lower = message.toLowerCase();
    if (
      lower.includes("new version") &&
      (lower.includes("available") || lower.includes("(running"))
    ) {
      await recordUserNotification({
        userId,
        eventType: "agent_update_available",
        severity: "info",
        title: "Agent update available",
        message: message || "A newer Steamline agent build is available for this host.",
        linkHref,
        hostId,
      });
    }
    return;
  }

  if (phase === "done") {
    await recordUserNotification({
      userId,
      eventType: "agent_update_applied",
      severity: "info",
      title: "Agent update applied",
      message: message || "The Steamline agent was updated successfully.",
      linkHref,
      hostId,
    });
    return;
  }

  if (phase === "error") {
    const lower = message.toLowerCase();
    const intermediateRollback =
      lower.includes("starting automatic rollback") ||
      lower.includes("rollback failed after update");
    const completedRollback =
      /\brolled back to\b/i.test(message) ||
      (lower.includes("rolled back") && !intermediateRollback);
    const rollback = completedRollback;
    await recordUserNotification({
      userId,
      eventType: rollback ? "agent_update_rollback" : "agent_update_failed",
      severity: "error",
      title: rollback ? "Agent update rolled back" : "Agent update failed",
      message:
        message ||
        (rollback
          ? "The agent update did not succeed and the previous version was restored."
          : "The agent update could not be completed. See host agent update history for details."),
      linkHref,
      hostId,
    });
  }
}

export async function notifyBackupTerminal(args: {
  userId: string;
  hostId: string;
  kind: "backup" | "restore";
  ok: boolean;
  message?: string;
}): Promise<void> {
  const event = args.ok
    ? args.kind === "backup"
      ? "backup_success"
      : "restore_success"
    : args.kind === "backup"
      ? "backup_fail"
      : "restore_fail";
  await recordUserNotification({
    userId: args.userId,
    eventType: event,
    severity: args.ok ? "info" : "warning",
    title: args.ok
      ? `${args.kind === "backup" ? "Backup" : "Restore"} finished`
      : `${args.kind === "backup" ? "Backup" : "Restore"} failed`,
    message: args.message ?? (args.ok ? "Completed successfully." : "See host backup history for details."),
    linkHref: `/hosts/${args.hostId}`,
    hostId: args.hostId,
  });
}

export async function countUnread(userId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(userNotifications)
    .where(and(eq(userNotifications.userId, userId), isNull(userNotifications.readAt)));
  return rows[0]?.c ?? 0;
}
