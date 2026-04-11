-- Optional Steam account name for this host (for your records; agent uses STEAMLINE_STEAM_* env on the machine).
ALTER TABLE "hosts" ADD COLUMN IF NOT EXISTS "steam_username" text;
