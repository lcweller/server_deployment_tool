ALTER TABLE "hosts" ADD COLUMN IF NOT EXISTS "linux_root_password_enc" text;
ALTER TABLE "hosts" ADD COLUMN IF NOT EXISTS "linux_root_password_pending_enc" text;
