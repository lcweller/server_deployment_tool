import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { hosts } from "@/db/schema";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/session-token";
import { requireVerifiedUser } from "@/lib/auth/require-verified";
import { effectiveHostStatus } from "@/lib/host-presence";

const platformOsSchema = z.enum(["linux", "macos", "windows"]);

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  platformOs: platformOsSchema,
});

export async function GET() {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const rows = await db
    .select()
    .from(hosts)
    .where(eq(hosts.userId, auth.user.id))
    .orderBy(desc(hosts.createdAt));

  const hostsOut = rows.map(
    ({
      enrollmentTokenHash: _hash,
      machineFingerprint: _mf,
      ...rest
    }) => ({
      ...rest,
      status: effectiveHostStatus({
        status: rest.status,
        lastSeenAt: rest.lastSeenAt,
      }),
      awaitingEnrollment: rest.status === "pending",
    })
  );

  return NextResponse.json({ hosts: hostsOut });
}

export async function POST(request: Request) {
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

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const enrollmentPlain = generateSessionToken();
  const enrollmentHash = hashSessionToken(enrollmentPlain);

  const [host] = await db
    .insert(hosts)
    .values({
      userId: auth.user.id,
      name: parsed.data.name,
      platformOs: parsed.data.platformOs,
      status: "pending",
      enrollmentTokenHash: enrollmentHash,
    })
    .returning({
      id: hosts.id,
      name: hosts.name,
      platformOs: hosts.platformOs,
      status: hosts.status,
      createdAt: hosts.createdAt,
    });

  return NextResponse.json({
    host,
    /** Show once — store in your agent or password manager. */
    enrollmentToken: enrollmentPlain,
  });
}
