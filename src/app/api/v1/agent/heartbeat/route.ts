import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import type { HostMetricsSnapshot } from "@/lib/host-metrics";
import { hosts, serverInstances } from "@/db/schema";
import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";

const metricsSchema = z
  .object({
    hostname: z.string().max(256).optional(),
    platform: z.string().max(32).optional(),
    cpuModel: z.string().max(512).optional(),
    cpuCores: z.number().int().min(1).max(4096).optional(),
    cpuSockets: z.number().int().min(1).max(256).nullable().optional(),
    cpuLayoutSummary: z.string().max(512).nullable().optional(),
    cpuModelLines: z.array(z.string().max(512)).max(64).optional(),
    loadAvg1m: z.number().min(0).max(1e6).optional(),
    cpuEstimatePercent: z.number().min(0).max(100).optional(),
    memTotalBytes: z.number().nonnegative().optional(),
    memUsedBytes: z.number().nonnegative().optional(),
    memUsedPercent: z.number().min(0).max(100).optional(),
    memoryModuleCount: z.number().int().min(0).max(256).nullable().optional(),
    memoryModuleSummary: z.string().max(2048).nullable().optional(),
    diskPath: z.string().max(512).optional(),
    diskTotalBytes: z.number().nonnegative().optional(),
    diskUsedBytes: z.number().nonnegative().optional(),
    diskFreeBytes: z.number().nonnegative().optional(),
    diskUsedPercent: z.number().min(0).max(100).optional(),
  })
  .strict();

const bodySchema = z.object({
  agentVersion: z.string().max(64).optional(),
  metrics: metricsSchema.optional(),
});

const minimalBodySchema = z.object({
  agentVersion: z.string().max(64).optional(),
});

export async function POST(request: Request) {
  const agent = await authenticateAgentApiKey(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown = {};
  try {
    const text = await request.text();
    if (text) {
      json = JSON.parse(text);
    }
  } catch {
    json = {};
  }

  let agentVersion: string | undefined;
  let metricsSnapshot: HostMetricsSnapshot | undefined;

  const full = bodySchema.safeParse(json);
  if (full.success) {
    agentVersion = full.data.agentVersion;
    if (full.data.metrics) {
      metricsSnapshot = {
        ...full.data.metrics,
        receivedAt: new Date().toISOString(),
      };
    }
  } else {
    const minimal = minimalBodySchema.safeParse(json);
    if (minimal.success) {
      agentVersion = minimal.data.agentVersion;
    }
  }

  const [hostRow] = await db
    .select({ rebootRequestedAt: hosts.rebootRequestedAt })
    .from(hosts)
    .where(eq(hosts.id, agent.host.id))
    .limit(1);

  const pendingReboot = hostRow?.rebootRequestedAt != null;

  await db
    .update(hosts)
    .set({
      lastSeenAt: new Date(),
      status: "online",
      ...(agentVersion ? { agentVersion } : {}),
      ...(metricsSnapshot ? { hostMetrics: metricsSnapshot } : {}),
    })
    .where(eq(hosts.id, agent.host.id));

  /** Legacy `draft` rows → `queued` once the host is talking to the API. */
  const promoted = await db
    .update(serverInstances)
    .set({ status: "queued", updatedAt: new Date() })
    .where(
      and(
        eq(serverInstances.hostId, agent.host.id),
        eq(serverInstances.status, "draft")
      )
    )
    .returning({ id: serverInstances.id });

  return NextResponse.json({
    ok: true,
    hostId: agent.host.id,
    promotedInstanceIds: promoted.map((r) => r.id),
    pendingReboot,
  });
}
