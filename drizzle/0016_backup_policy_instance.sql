ALTER TABLE "host_backup_policies" ADD COLUMN IF NOT EXISTS "instance_id" uuid;
ALTER TABLE "host_backup_policies" ADD COLUMN IF NOT EXISTS "last_scheduled_at" timestamp with time zone;

ALTER TABLE "host_backup_policies"
  ADD CONSTRAINT "host_backup_policies_instance_id_server_instances_id_fk"
  FOREIGN KEY ("instance_id") REFERENCES "public"."server_instances"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "host_backup_policies_dest_instance_uidx"
  ON "host_backup_policies" ("destination_id", COALESCE("instance_id", '00000000-0000-0000-0000-000000000001'::uuid));
