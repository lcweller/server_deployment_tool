-- Per-instance network ports (game / query / optional rcon). Allocated at create time; agent may adjust after bind probe.
ALTER TABLE "server_instances" ADD COLUMN IF NOT EXISTS "allocated_ports" jsonb;
