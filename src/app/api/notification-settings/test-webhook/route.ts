import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { userNotificationSettings } from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";

export async function POST() {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const [settings] = await db
    .select()
    .from(userNotificationSettings)
    .where(eq(userNotificationSettings.userId, auth.user.id))
    .limit(1);

  const url = settings?.webhookUrl?.trim();
  if (!url) {
    return NextResponse.json({ error: "Configure webhook URL first." }, { status: 400 });
  }

  const body = {
    event: "test_webhook",
    severity: "info",
    title: "Steamline webhook test",
    message: "If you see this JSON, your webhook URL is reachable.",
    at: new Date().toISOString(),
  };
  const sig = settings.webhookSecret?.trim();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sig ? { "X-Steamline-Signature": sig } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      bodyPreview: text.slice(0, 500),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Request failed" },
      { status: 502 }
    );
  }
}
