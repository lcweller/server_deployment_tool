ALTER TABLE "hosts" ADD COLUMN IF NOT EXISTS "machine_fingerprint" text;
CREATE UNIQUE INDEX IF NOT EXISTS "hosts_user_machine_fingerprint_uidx" ON "hosts" ("user_id", "machine_fingerprint") WHERE "machine_fingerprint" IS NOT NULL;
