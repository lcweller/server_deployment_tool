import { NextResponse } from "next/server";

import {
  createEmailVerificationToken,
  sendVerificationEmail,
} from "@/lib/auth/email-verification";
import { getCurrentUser } from "@/lib/auth/session";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.emailVerifiedAt) {
    return NextResponse.json({ error: "Already verified" }, { status: 400 });
  }

  const raw = await createEmailVerificationToken(user.id);
  try {
    await sendVerificationEmail(user.email, raw);
  } catch (e) {
    console.error("[mail] resend failed:", e);
    return NextResponse.json(
      { error: "Could not send email. Check SMTP configuration." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
