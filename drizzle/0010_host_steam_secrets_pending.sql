-- Encrypted one-shot Steam credentials queue (dashboard → next agent heartbeat → cleared).
ALTER TABLE "hosts" ADD COLUMN IF NOT EXISTS "steam_secrets_pending" text;
