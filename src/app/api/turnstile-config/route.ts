import { NextResponse } from "next/server";

/**
 * Runtime captcha config for the client.
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is build-time only in pre-built Docker images;
 * use `TURNSTILE_SITE_KEY` on the server at runtime (same value Turnstile shows as "site key").
 */
export async function GET() {
  const v = process.env.STEAMLINE_SKIP_TURNSTILE?.toLowerCase();
  const skipTurnstile = v === "1" || v === "true" || v === "yes";
  const siteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
    process.env.TURNSTILE_SITE_KEY ||
    null;
  return NextResponse.json({
    skipTurnstile,
    siteKey,
  });
}
