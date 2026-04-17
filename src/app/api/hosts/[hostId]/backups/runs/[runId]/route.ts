import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { hostBackupDestinations, hosts } from "@/db/schema";
import { deleteBackupRunRow, getBackupRun } from "@/lib/backups";
import { deleteS3BackupObject } from "@/lib/backup-s3";
import { requireVerifiedUser } from "@/lib/auth/require-verified";
import { sendControlToAgent } from "@/server/agent-socket-registry";

type RouteCtx = { params: Promise<{ hostId: string; runId: string }> };

export async function DELETE(_request: Request, ctx: RouteCtx) {
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
  if (!run || run.hostId !== hostId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (run.destinationId && run.archivePath) {
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
    if (dest) {
      if (dest.kind === "s3") {
        try {
          await deleteS3BackupObject(
            dest.config as Record<string, unknown>,
            run.archivePath
          );
        } catch (e) {
          return NextResponse.json(
            {
              error:
                e instanceof Error ? e.message : "Could not delete object in S3.",
            },
            { status: 500 }
          );
        }
      } else {
        const sent = sendControlToAgent(hostId, {
          action: "backup_delete",
          destination: {
            id: dest.id,
            kind: dest.kind,
            name: dest.name,
            config: dest.config as Record<string, unknown>,
          },
          archivePath: run.archivePath,
        });
        if (!sent) {
          return NextResponse.json(
            {
              error:
                "Agent is not connected — cannot delete files on this host. Reconnect the agent and try again.",
            },
            { status: 503 }
          );
        }
      }
    }
  }

  await deleteBackupRunRow(runId);
  return NextResponse.json({ ok: true });
}
