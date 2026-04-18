import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import {
  createEmailVerificationToken,
  sendVerificationEmail,
} from "@/lib/auth/email-verification";
import { hashPassword } from "@/lib/auth/password";
import { createSessionForUser } from "@/lib/auth/session";
import { verifyTurnstileToken } from "@/lib/turnstile";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(200),
  turnstileToken: z.string().optional(),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const turnstileOk = await verifyTurnstileToken(parsed.data.turnstileToken);
  if (!turnstileOk) {
    return NextResponse.json(
      { error: "Captcha verification failed. Try again." },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(users)
    .values({
      email,
      displayName: parsed.data.name,
      passwordHash,
    })
    .returning({ id: users.id, email: users.email });

  const raw = await createEmailVerificationToken(user.id);
  try {
    await sendVerificationEmail(user.email, raw);
  } catch (e) {
    console.error("[mail] verification send failed:", e);
    return NextResponse.json(
      {
        error:
          "Account created but we could not send email. Check SMTP settings or try resend from the verification page.",
      },
      { status: 500 }
    );
  }

  await createSessionForUser(user.id);

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email },
    needsEmailVerification: true,
  });
}
