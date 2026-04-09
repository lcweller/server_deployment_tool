import { NextResponse } from "next/server";

import { verifyEmailWithToken } from "@/lib/auth/email-verification";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", url.origin));
  }

  const result = await verifyEmailWithToken(token);

  if (!result.ok) {
    const q =
      result.reason === "expired" ? "expired_token" : "invalid_token";
    return NextResponse.redirect(
      new URL(`/login?verified=${q}`, url.origin)
    );
  }

  return NextResponse.redirect(
    new URL("/login?verified=1", url.origin)
  );
}
