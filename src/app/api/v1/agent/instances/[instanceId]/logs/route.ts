import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { instanceLogLines, serverInstances } from "@/db/schema";
import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";

const bodySchema = z.object({
  lines: z.array(z.string().max(16000)).max(500),
});

type RouteContext = { params: Promise<{ instanceId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const agent = await authenticateAgentApiKey(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { instanceId } = await context.params;

  const inst = await db
    .select()
    .from(serverInstances)
    .where(eq(serverInstances.id, instanceId))
    .limit(1);

  const row = inst[0];
  if (!row || row.hostId !== agent.host.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  if (parsed.data.lines.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  await db.insert(instanceLogLines).values(
    parsed.data.lines.map((line) => ({
      instanceId: row.id,
      line,
    }))
  );

  return NextResponse.json({ ok: true, inserted: parsed.data.lines.length });
}
