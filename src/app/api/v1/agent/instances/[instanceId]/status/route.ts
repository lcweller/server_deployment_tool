import { NextResponse } from "next/server";
import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";
import { applyAgentInstanceStatus } from "@/lib/agent/instance-status-core";

type RouteCtx = { params: Promise<{ instanceId: string }> };

/**
 * Agent reports provisioning progress (installing → running | failed).
 */
export async function POST(request: Request, ctx: RouteCtx) {
  const agent = await authenticateAgentApiKey(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { instanceId } = await ctx.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await applyAgentInstanceStatus(agent.host, instanceId, json);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, instanceId, status: result.status });
}
