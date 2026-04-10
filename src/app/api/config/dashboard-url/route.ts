import { NextResponse } from "next/server";

import { publicAppUrl } from "@/lib/public-app-url";

/**
 * Runtime dashboard URL for agent install commands (always uses `APP_PUBLIC_URL` when set).
 * Avoids baking LAN origins (e.g. http://192.168.x.x:8765) into one-line install when a public URL exists.
 * Production hosted URL: https://game.layeroneconstultants.com
 */
export async function GET() {
  const dashboardUrl = publicAppUrl();
  const fromAppPublic = Boolean(
    process.env["APP_PUBLIC_URL"]?.trim()
  );
  return NextResponse.json({
    dashboardUrl,
    /** True when APP_PUBLIC_URL was set (recommended for remote game hosts). */
    usedPublicEnv: fromAppPublic,
  });
}
