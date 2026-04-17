CREATE TABLE IF NOT EXISTS "user_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'info',
  "title" text NOT NULL,
  "message" text NOT NULL,
  "link_href" text,
  "host_id" uuid REFERENCES "hosts"("id") ON DELETE SET NULL,
  "instance_id" uuid REFERENCES "server_instances"("id") ON DELETE SET NULL,
  "dedupe_key" text,
  "occurrence_count" integer NOT NULL DEFAULT 1,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "user_notifications_user_read_created"
  ON "user_notifications" ("user_id", "read_at", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "user_notification_settings" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "email_enabled" boolean NOT NULL DEFAULT false,
  "webhook_enabled" boolean NOT NULL DEFAULT false,
  "resend_api_key" text,
  "webhook_url" text,
  "webhook_secret" text,
  "alert_cooldown_sec" integer NOT NULL DEFAULT 300,
  "crash_dedup_sec" integer NOT NULL DEFAULT 600,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_notification_event_prefs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "email" boolean NOT NULL DEFAULT true,
  "webhook" boolean NOT NULL DEFAULT false,
  UNIQUE ("user_id", "event_type")
);
