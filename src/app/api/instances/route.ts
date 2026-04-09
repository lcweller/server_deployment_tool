import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { catalogEntries, hosts, serverInstances } from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  hostId: z.string().uuid(),
  catalogEntryId: z.string().uuid(),
});

export async function GET() {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const rows = await db
    .select({
      id: serverInstances.id,
      name: serverInstances.name,
      status: serverInstances.status,
      hostId: serverInstances.hostId,
      catalogEntryId: serverInstances.catalogEntryId,
      createdAt: serverInstances.createdAt,
      updatedAt: serverInstances.updatedAt,
      catalogName: catalogEntries.name,
      catalogSlug: catalogEntries.slug,
      steamAppId: catalogEntries.steamAppId,
      hostName: hosts.name,
      provisionMessage: serverInstances.provisionMessage,
      lastError: serverInstances.lastError,
    })
    .from(serverInstances)
    .leftJoin(catalogEntries, eq(serverInstances.catalogEntryId, catalogEntries.id))
    .leftJoin(hosts, eq(serverInstances.hostId, hosts.id))
    .where(eq(serverInstances.userId, auth.user.id))
    .orderBy(desc(serverInstances.updatedAt));

  return NextResponse.json({ instances: rows });
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

  const hostRows = await db
    .select()
    .from(hosts)
    .where(eq(hosts.id, parsed.data.hostId))
    .limit(1);

  const host = hostRows[0];
  if (!host || host.userId !== auth.user.id) {
    return NextResponse.json({ error: "Host not found" }, { status: 404 });
  }

  if (host.status === "pending") {
    return NextResponse.json(
      { error: "Host is not enrolled yet. Finish agent enrollment first." },
      { status: 400 }
    );
  }

  const catRows = await db
    .select({ id: catalogEntries.id })
    .from(catalogEntries)
    .where(eq(catalogEntries.id, parsed.data.catalogEntryId))
    .limit(1);

  if (!catRows[0]) {
    return NextResponse.json({ error: "Catalog entry not found" }, { status: 404 });
  }

  /**
   * `queued` = waiting for the host agent to provision (installing → running).
   */
  const [instance] = await db
    .insert(serverInstances)
    .values({
      userId: auth.user.id,
      hostId: parsed.data.hostId,
      catalogEntryId: parsed.data.catalogEntryId,
      name: parsed.data.name,
      status: "queued",
    })
    .returning({
      id: serverInstances.id,
      name: serverInstances.name,
      status: serverInstances.status,
      hostId: serverInstances.hostId,
      catalogEntryId: serverInstances.catalogEntryId,
      createdAt: serverInstances.createdAt,
      updatedAt: serverInstances.updatedAt,
    });

  return NextResponse.json({ instance });
}
