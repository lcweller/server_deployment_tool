import "server-only";

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

export function s3ClientFromBackupConfig(cfg: Record<string, unknown>): S3Client {
  const region = String(cfg.region ?? "us-east-1");
  const endpoint = typeof cfg.endpoint === "string" ? cfg.endpoint : undefined;
  const accessKeyId = String(cfg.accessKeyId ?? "");
  const secretAccessKey = String(cfg.secretAccessKey ?? "");
  return new S3Client({
    region,
    endpoint,
    forcePathStyle: cfg.forcePathStyle === true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * Delete a single backup object from S3/MinIO using destination credentials.
 * S3 DeleteObject is idempotent (no error if the key is already gone).
 */
export async function deleteS3BackupObject(
  cfg: Record<string, unknown>,
  key: string
): Promise<void> {
  const bucket = String(cfg.bucket ?? "");
  if (!bucket) {
    throw new Error("S3 bucket not configured.");
  }
  const client = s3ClientFromBackupConfig(cfg);
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}
