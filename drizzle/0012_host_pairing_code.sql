ALTER TABLE "hosts" ADD COLUMN IF NOT EXISTS "pairing_code_hash" text;
ALTER TABLE "hosts" ADD COLUMN IF NOT EXISTS "pairing_expires_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "idx_hosts_pairing_code_hash"
  ON "hosts" ("pairing_code_hash")
  WHERE "pairing_code_hash" IS NOT NULL;
