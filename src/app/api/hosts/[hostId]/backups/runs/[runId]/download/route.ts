import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { hostBackupDestinations, hosts } from "@/db/schema";
import { getBackupRun } from "@/lib/backups";
import { s3ClientFromBackupConfig } from "@/lib/backup-s3";
import { requireVerifiedUser } from "@/lib/auth/require-verified";

type RouteCtx = { params: Promise<{ hostId: string; runId: string }> };

export async function GET(_request: Request, ctx: RouteCtx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }
  const { hostId, runId } = await ctx.params;

  const hostOk = await db
    .select({ id: hosts.id })
    .from(hosts)
    .where(and(eq(hosts.id, hostId), eq(hosts.userId, auth.user.id)))
    .limit(1);
  if (!hostOk[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const run = await getBackupRun(runId);
  if (!run || run.hostId !== hostId || run.kind !== "backup") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (run.status !== "done" || !run.archivePath) {
    return NextResponse.json(
      { error: "Backup is not ready or has no artifact path." },
      { status: 409 }
    );
  }

  if (!run.destinationId) {
    return NextResponse.json({ error: "No destination for this run." }, { status: 400 });
  }

  const destRows = await db
    .select()
    .from(hostBackupDestinations)
    .where(
      and(
        eq(hostBackupDestinations.id, run.destinationId),
        eq(hostBackupDestinations.hostId, hostId)
      )
    )
    .limit(1);
  const dest = destRows[0];
  if (!dest) {
    return NextResponse.json({ error: "Destination missing." }, { status: 404 });
  }

  const cfg = dest.config as Record<string, unknown>;

  if (dest.kind === "s3") {
    const bucket = String(cfg.bucket ?? "");
    if (!bucket) {
      return NextResponse.json({ error: "S3 bucket not configured." }, { status: 400 });
    }
    const client = s3ClientFromBackupConfig(cfg);
    const cmd = new GetObjectCommand({
      Bucket: bucket,
      Key: run.archivePath,
    });
    try {
      const url = await getSignedUrl(client, cmd, { expiresIn: 3600 });
      return NextResponse.redirect(url);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Could not sign download URL." },
        { status: 500 }
      );
    }
  }

  if (dest.kind === "local") {
    return NextResponse.json({
      mode: "local",
      path: run.archivePath,
      message:
        "This backup file lives on the host disk. Copy it from the host or use SSH-less file access from the machine running the agent.",
    });
  }

  return NextResponse.json({
    mode: "sftp",
    path: run.archivePath,
    message:
      "Download this file with your SFTP client using the configured destination (same path on the server).",
  });
}
