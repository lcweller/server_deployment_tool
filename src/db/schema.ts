import type { AllocatedPorts } from "@/lib/allocated-ports";
import type { HostMetricsSnapshot } from "@/lib/host-metrics";
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Steam catalog row + launch template (JSON). */
export const catalogEntries = pgTable("catalog_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  steamAppId: text("steam_app_id").notNull(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  template: jsonb("template")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  popularityScore: integer("popularity_score").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Operator overrides for catalog visibility and ranking. */
export const catalogOverrides = pgTable("catalog_overrides", {
  steamAppId: text("steam_app_id").primaryKey(),
  hidden: boolean("hidden").notNull().default(false),
  scoreBoost: integer("score_boost").notNull().default(0),
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const hosts = pgTable("hosts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** linux | macos | windows — target OS for install instructions */
  platformOs: text("platform_os"),
  /** pending | online | offline */
  status: text("status").notNull().default("pending"),
  enrollmentTokenHash: text("enrollment_token_hash").unique(),
  agentVersion: text("agent_version"),
  /** Latest resource snapshot from agent heartbeat (CPU / RAM / disk). */
  hostMetrics: jsonb("host_metrics").$type<HostMetricsSnapshot | null>(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  /** Dashboard requested reboot — agent consumes on next heartbeat. */
  rebootRequestedAt: timestamp("reboot_requested_at", { withTimezone: true }),
  /**
   * Stable id for this OS instance — prevents enrolling two dashboard hosts from the same machine.
   */
  machineFingerprint: text("machine_fingerprint"),
  /**
   * Optional Steam persona / login name for licensed SteamCMD installs.
   * The agent never reads the password from the API — set credentials only on the host (env or files).
   */
  steamUsername: text("steam_username"),
  /**
   * AES-256-GCM blob (base64) of pending SteamCMD secrets — delivered once on the next
   * authenticated agent heartbeat, then cleared. Never logged.
   */
  steamSecretsPending: text("steam_secrets_pending"),
  /**
   * AES-GCM blob (base64): Linux root password set at install or after dashboard rotation
   * (decrypt with STEAMLINE_HOST_STEAM_SECRET / AUTH_SECRET).
   */
  linuxRootPasswordEnc: text("linux_root_password_enc"),
  /** Queued root password change for the agent (cleared on heartbeat delivery). */
  linuxRootPasswordPendingEnc: text("linux_root_password_pending_enc"),
  /** SHA-256–style hash of a short pairing code for GameServerOS / dashboard enrollment. */
  pairingCodeHash: text("pairing_code_hash"),
  pairingExpiresAt: timestamp("pairing_expires_at", { withTimezone: true }),
  updateMode: text("update_mode").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Audit: remote terminal session open/close (no transcript). */
/**
 * GameServerOS first-boot: machine requests a display pairing code + poll token;
 * user claims the code on the dashboard; installer polls until linked then enrolls.
 */
export const gameserverosInstallSessions = pgTable("gameserveros_install_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  pairingCodeHash: text("pairing_code_hash").notNull().unique(),
  pollTokenHash: text("poll_token_hash").notNull().unique(),
  hostId: uuid("host_id").references(() => hosts.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const hostTerminalSessions = pgTable("host_terminal_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostId: uuid("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

/** Audit trail for agent self-update phases (dashboard + operator visibility). */
export const hostAgentUpdateEvents = pgTable("host_agent_update_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostId: uuid("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  phase: text("phase").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Long-lived API key for an enrolled host (hashed at rest). */
export const hostApiKeys = pgTable("host_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostId: uuid("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull().unique(),
  label: text("label"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const serverInstances = pgTable("server_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  hostId: uuid("host_id").references(() => hosts.id, { onDelete: "set null" }),
  catalogEntryId: uuid("catalog_entry_id").references(
    () => catalogEntries.id,
    { onDelete: "set null" }
  ),
  name: text("name").notNull(),
  /**
   * draft → queued → installing → running | failed
   * Power: running → stopping → stopped → starting → running
   * Watchdog: running → recovering → running | failed
   * pending_delete = removal in progress
   */
  status: text("status").notNull().default("draft"),
  provisionMessage: text("provision_message"),
  lastError: text("last_error"),
  /** Game / query / optional RCON — allocated per host to avoid collisions; agent may refine after bind probe. */
  allocatedPorts: jsonb("allocated_ports").$type<AllocatedPorts | null>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const instanceLogLines = pgTable("instance_log_lines", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => serverInstances.id, { onDelete: "cascade" }),
  line: text("line").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const hostBackupDestinations = pgTable("host_backup_destinations", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostId: uuid("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // local | s3 | sftp
  name: text("name").notNull(),
  config: jsonb("config")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const hostBackupPolicies = pgTable("host_backup_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostId: uuid("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  destinationId: uuid("destination_id")
    .notNull()
    .references(() => hostBackupDestinations.id, { onDelete: "cascade" }),
  /** When set, scheduled backups target this game server instance only. */
  instanceId: uuid("instance_id").references(() => serverInstances.id, {
    onDelete: "cascade",
  }),
  scheduleMode: text("schedule_mode").notNull().default("manual"),
  /** daily: `HH:mm` UTC; weekly: `dow:HH:mm` UTC (dow 0=Sunday). */
  scheduleExpr: text("schedule_expr"),
  keepLast: integer("keep_last"),
  keepDays: integer("keep_days"),
  enabled: boolean("enabled").notNull().default(true),
  lastScheduledAt: timestamp("last_scheduled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const hostBackupRuns = pgTable("host_backup_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostId: uuid("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  instanceId: uuid("instance_id").references(() => serverInstances.id, {
    onDelete: "set null",
  }),
  destinationId: uuid("destination_id").references(() => hostBackupDestinations.id, {
    onDelete: "set null",
  }),
  kind: text("kind").notNull(), // backup | restore
  status: text("status").notNull().default("queued"), // queued | running | done | failed
  phase: text("phase"),
  message: text("message"),
  archivePath: text("archive_path"),
  checksumSha256: text("checksum_sha256"),
  sizeBytes: integer("size_bytes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  status: text("status").notNull(),
  priceId: text("price_id"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userNotifications = pgTable("user_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  severity: text("severity").notNull().default("info"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  linkHref: text("link_href"),
  hostId: uuid("host_id").references(() => hosts.id, { onDelete: "set null" }),
  instanceId: uuid("instance_id").references(() => serverInstances.id, {
    onDelete: "set null",
  }),
  dedupeKey: text("dedupe_key"),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userNotificationSettings = pgTable("user_notification_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  webhookEnabled: boolean("webhook_enabled").notNull().default(false),
  resendApiKey: text("resend_api_key"),
  webhookUrl: text("webhook_url"),
  webhookSecret: text("webhook_secret"),
  alertCooldownSec: integer("alert_cooldown_sec").notNull().default(300),
  crashDedupSec: integer("crash_dedup_sec").notNull().default(600),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userNotificationEventPrefs = pgTable(
  "user_notification_event_prefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    email: boolean("email").notNull().default(true),
    webhook: boolean("webhook").notNull().default(false),
  },
  (t) => [unique("user_notification_event_prefs_user_event").on(t.userId, t.eventType)]
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type CatalogEntry = typeof catalogEntries.$inferSelect;
export type Host = typeof hosts.$inferSelect;
export type ServerInstance = typeof serverInstances.$inferSelect;
