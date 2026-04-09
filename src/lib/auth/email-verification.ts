import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { emailVerificationTokens, users } from "@/db/schema";
import { sendMail, publicAppUrl } from "@/lib/mail";

import { generateSessionToken, hashSessionToken } from "./session-token";

const TOKEN_HOURS = 48;

export async function createEmailVerificationToken(userId: string) {
  const raw = generateSessionToken();
  const tokenHash = hashSessionToken(raw);
  const expiresAt = new Date(Date.now() + TOKEN_HOURS * 60 * 60 * 1000);

  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));

  await db.insert(emailVerificationTokens).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return raw;
}

export async function sendVerificationEmail(email: string, rawToken: string) {
  const url = `${publicAppUrl()}/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
  await sendMail({
    to: email,
    subject: "Verify your Steamline account",
    text: `Welcome to Steamline.\n\nVerify your email by opening this link (expires in ${TOKEN_HOURS} hours):\n${url}\n\nIf you did not sign up, ignore this message.`,
    html: `<p>Welcome to Steamline.</p><p><a href="${url}">Verify your email</a></p><p>This link expires in ${TOKEN_HOURS} hours.</p>`,
  });
}

export async function verifyEmailWithToken(rawToken: string) {
  const tokenHash = hashSessionToken(rawToken);
  const rows = await db
    .select({
      token: emailVerificationTokens,
      user: users,
    })
    .from(emailVerificationTokens)
    .innerJoin(users, eq(emailVerificationTokens.userId, users.id))
    .where(eq(emailVerificationTokens.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return { ok: false as const, reason: "invalid" as const };
  }

  if (row.token.expiresAt < new Date()) {
    await db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.id, row.token.id));
    return { ok: false as const, reason: "expired" as const };
  }

  await db
    .update(users)
    .set({
      emailVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, row.user.id));

  await db
    .delete(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, row.user.id));

  return { ok: true as const, userId: row.user.id };
}
