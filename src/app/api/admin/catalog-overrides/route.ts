import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { catalogOverrides } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

const bodySchema = z.object({
  steamAppId: z.string().min(1).max(32),
  hidden: z.boolean().optional(),
  scoreBoost: z.number().int().min(-1000).max(1000).optional(),
  note: z.string().max(500).optional(),
});

function isPlatformAdmin(email: string) {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  const set = new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
  return set.has(email.toLowerCase());
}

/**
 * Operator overrides for catalog visibility and ranking.
 * Auth: `Authorization: Bearer <CRON_SECRET>` **or** signed-in user email in PLATFORM_ADMIN_EMAILS.
 */
export async function POST(request: Request) {
  const cron = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;
  const cronOk = secret && cron === secret;

  if (!cronOk) {
    const user = await getCurrentUser();
    if (!user?.emailVerifiedAt || !isPlatformAdmin(user.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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

  const { steamAppId, hidden, scoreBoost, note } = parsed.data;

  await db
    .insert(catalogOverrides)
    .values({
      steamAppId,
      hidden: hidden ?? false,
      scoreBoost: scoreBoost ?? 0,
      note: note ?? null,
    })
    .onConflictDoUpdate({
      target: catalogOverrides.steamAppId,
      set: {
        hidden: hidden ?? false,
        scoreBoost: scoreBoost ?? 0,
        note: note ?? null,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const cron = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secret = process.env.CRON_SECRET;
  if (!secret || cron !== secret) {
    const user = await getCurrentUser();
    if (!user?.emailVerifiedAt || !isPlatformAdmin(user.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const rows = await db.select().from(catalogOverrides);
  return NextResponse.json({ overrides: rows });
}
