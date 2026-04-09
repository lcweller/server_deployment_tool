import { NextResponse } from "next/server";

/**
 * Liveness for Docker / reverse proxies (no DB ping — avoids failing during migrations).
 */
export async function GET() {
  return NextResponse.json({ ok: true, service: "steamline" });
}
