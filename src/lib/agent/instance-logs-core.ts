import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { instanceLogLines, serverInstances } from "@/db/schema";
import { recordUserNotification } from "@/lib/user-notifications";

const logsBodySchema = z.object({
  lines: z.array(z.string().max(16000)).max(500),
});

type AgentHostIdentity = { id: string };

export async function appendAgentInstanceLogs(
  host: AgentHostIdentity,
  instanceId: string,
  body: unknown
): Promise<{ ok: true; inserted: number } | { ok: false; error: string; status: number }> {
  const inst = await db
    .select({
      id: serverInstances.id,
      hostId: serverInstances.hostId,
      name: serverInstances.name,
      userId: serverInstances.userId,
    })
    .from(serverInstances)
    .where(eq(serverInstances.id, instanceId))
    .limit(1);

  const row = inst[0];
  if (!row || row.hostId !== host.id) {
    return { ok: false, error: "Not found", status: 404 };
  }

  const parsed = logsBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Validation failed", status: 400 };
  }
  if (parsed.data.lines.length === 0) {
    return { ok: true, inserted: 0 };
  }

  await db.insert(instanceLogLines).values(
    parsed.data.lines.map((line) => ({
      instanceId: row.id,
      line,
    }))
  );

  const healLine = parsed.data.lines.find((line) =>
    /\[steamline\] auto-heal: applied remediation/i.test(line)
  );
  if (healLine) {
    void recordUserNotification({
      userId: row.userId,
      eventType: "self_heal",
      severity: "warning",
      title: `Log self-healing: ${row.name}`,
      message: healLine.slice(0, 4000),
      linkHref: `/servers`,
      hostId: row.hostId ?? undefined,
      instanceId: row.id,
    });
  }

  return { ok: true, inserted: parsed.data.lines.length };
}
