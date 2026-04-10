import { NextResponse } from "next/server";

import { verifyEmailWithToken } from "@/lib/auth/email-verification";
import { publicAppUrl } from "@/lib/mail";

function absolutePath(pathWithQuery: string): string {
  const base = publicAppUrl().replace(/\/$/, "");
  const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  return `${base}${path}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(absolutePath("/email-verified?reason=missing"), 302);
  }

  const result = await verifyEmailWithToken(token);

  if (!result.ok) {
    const reason = result.reason === "expired" ? "expired" : "invalid";
    return NextResponse.redirect(
      absolutePath(`/email-verified?reason=${reason}`),
      302
    );
  }

  return NextResponse.redirect(absolutePath("/email-verified"), 302);
}
