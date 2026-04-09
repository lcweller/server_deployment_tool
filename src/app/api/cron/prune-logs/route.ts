import { lt } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { instanceLogLines } from "@/db/schema";

export const dynamic = "force-dynamic";

const RETENTION_DAYS = 7;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("token");

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  const deleted = await db
    .delete(instanceLogLines)
    .where(lt(instanceLogLines.createdAt, cutoff))
    .returning({ id: instanceLogLines.id });

  return NextResponse.json({
    deletedRows: deleted.length,
    cutoff: cutoff.toISOString(),
  });
}
