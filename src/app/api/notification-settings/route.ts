import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { userNotificationEventPrefs, userNotificationSettings } from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/user-notifications";

const patchSchema = z.object({
  emailEnabled: z.boolean().optional(),
  webhookEnabled: z.boolean().optional(),
  resendApiKey: z.string().nullable().optional(),
  webhookUrl: z.string().nullable().optional(),
  webhookSecret: z.string().nullable().optional(),
  alertCooldownSec: z.number().int().min(60).max(3600).optional(),
  crashDedupSec: z.number().int().min(60).max(7200).optional(),
  eventPrefs: z
    .array(
      z.object({
        eventType: z.string(),
        email: z.boolean(),
        webhook: z.boolean(),
      })
    )
    .optional(),
});

export async function GET() {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const [settings] = await db
    .select()
    .from(userNotificationSettings)
    .where(eq(userNotificationSettings.userId, auth.user.id))
    .limit(1);

  const prefs = await db
    .select()
    .from(userNotificationEventPrefs)
    .where(eq(userNotificationEventPrefs.userId, auth.user.id));

  return NextResponse.json({
    settings: settings ?? null,
    eventPrefs: prefs,
    eventTypes: NOTIFICATION_EVENT_TYPES,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(userNotificationSettings)
    .where(eq(userNotificationSettings.userId, auth.user.id))
    .limit(1);
  if (!existing[0]) {
    await db.insert(userNotificationSettings).values({ userId: auth.user.id });
  }

  const p = parsed.data;
  await db
    .update(userNotificationSettings)
    .set({
      ...(p.emailEnabled !== undefined ? { emailEnabled: p.emailEnabled } : {}),
      ...(p.webhookEnabled !== undefined ? { webhookEnabled: p.webhookEnabled } : {}),
      ...(p.resendApiKey !== undefined ? { resendApiKey: p.resendApiKey } : {}),
      ...(p.webhookUrl !== undefined ? { webhookUrl: p.webhookUrl } : {}),
      ...(p.webhookSecret !== undefined ? { webhookSecret: p.webhookSecret } : {}),
      ...(p.alertCooldownSec !== undefined ? { alertCooldownSec: p.alertCooldownSec } : {}),
      ...(p.crashDedupSec !== undefined ? { crashDedupSec: p.crashDedupSec } : {}),
      updatedAt: new Date(),
    })
    .where(eq(userNotificationSettings.userId, auth.user.id));

  if (p.eventPrefs) {
    await db
      .delete(userNotificationEventPrefs)
      .where(eq(userNotificationEventPrefs.userId, auth.user.id));
    if (p.eventPrefs.length > 0) {
      await db.insert(userNotificationEventPrefs).values(
        p.eventPrefs.map((row) => ({
          userId: auth.user.id,
          eventType: row.eventType,
          email: row.email,
          webhook: row.webhook,
        }))
      );
    }
  }

  return NextResponse.json({ ok: true });
}
