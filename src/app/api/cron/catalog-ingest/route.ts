import { NextResponse } from "next/server";

import { ingestSteamCatalog } from "@/lib/jobs/ingest-steam-catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const token =
    auth?.startsWith("Bearer ") ? auth.slice(7) : new URL(request.url).searchParams.get("token");

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await ingestSteamCatalog({ maxRows: 500 });
  return NextResponse.json(result);
}
