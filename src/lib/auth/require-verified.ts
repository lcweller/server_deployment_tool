import "server-only";

import { NextResponse } from "next/server";

import { getCurrentUser } from "./session";

export async function requireVerifiedUser() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }
  if (!user.emailVerifiedAt) {
    return {
      error: NextResponse.json(
        { error: "Verify your email before this action." },
        { status: 403 }
      ),
    } as const;
  }
  return { user } as const;
}
