ALTER TABLE "server_instances" ADD COLUMN "provision_message" text;
ALTER TABLE "server_instances" ADD COLUMN "last_error" text;
UPDATE "server_instances" SET "status" = 'queued' WHERE "status" = 'registered';
UPDATE "server_instances" SET "status" = 'queued' WHERE "status" = 'draft' AND "host_id" IS NOT NULL AND "host_id" IN (SELECT "id" FROM "hosts" WHERE "status" <> 'pending');
