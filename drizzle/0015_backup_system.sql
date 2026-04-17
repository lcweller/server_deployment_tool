CREATE TABLE "host_backup_destinations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "host_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "name" text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "host_backup_destinations"
  ADD CONSTRAINT "host_backup_destinations_host_id_hosts_id_fk"
  FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE TABLE "host_backup_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "host_id" uuid NOT NULL,
  "destination_id" uuid NOT NULL,
  "schedule_mode" text DEFAULT 'manual' NOT NULL,
  "schedule_expr" text,
  "keep_last" integer,
  "keep_days" integer,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "host_backup_policies"
  ADD CONSTRAINT "host_backup_policies_host_id_hosts_id_fk"
  FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "host_backup_policies"
  ADD CONSTRAINT "host_backup_policies_destination_id_host_backup_destinations_id_fk"
  FOREIGN KEY ("destination_id") REFERENCES "public"."host_backup_destinations"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE TABLE "host_backup_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "host_id" uuid NOT NULL,
  "instance_id" uuid,
  "destination_id" uuid,
  "kind" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "phase" text,
  "message" text,
  "archive_path" text,
  "checksum_sha256" text,
  "size_bytes" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "host_backup_runs"
  ADD CONSTRAINT "host_backup_runs_host_id_hosts_id_fk"
  FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "host_backup_runs"
  ADD CONSTRAINT "host_backup_runs_instance_id_server_instances_id_fk"
  FOREIGN KEY ("instance_id") REFERENCES "public"."server_instances"("id")
  ON DELETE set null ON UPDATE no action;

ALTER TABLE "host_backup_runs"
  ADD CONSTRAINT "host_backup_runs_destination_id_host_backup_destinations_id_fk"
  FOREIGN KEY ("destination_id") REFERENCES "public"."host_backup_destinations"("id")
  ON DELETE set null ON UPDATE no action;
