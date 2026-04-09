-- Enrolled hosts: server rows created as draft should show registered in the UI
-- without requiring a heartbeat at creation time.
UPDATE "server_instances"
SET
  "status" = 'registered',
  "updated_at" = now()
WHERE
  "status" = 'draft'
  AND "host_id" IS NOT NULL
  AND "host_id" IN (
    SELECT "id" FROM "hosts" WHERE "status" != 'pending'
  );
