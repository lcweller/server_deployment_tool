import type { HostMetricsSnapshot } from "@/lib/host-metrics";
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
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
  updateMode: text("update_mode").notNull().default("manual"),
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
  /** queued | installing | running | failed (+ legacy draft) */
  status: text("status").notNull().default("draft"),
  provisionMessage: text("provision_message"),
  lastError: text("last_error"),
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

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type CatalogEntry = typeof catalogEntries.$inferSelect;
export type Host = typeof hosts.$inferSelect;
export type ServerInstance = typeof serverInstances.$inferSelect;
