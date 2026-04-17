import { NextResponse } from "next/server";
import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";
import { appendAgentInstanceLogs } from "@/lib/agent/instance-logs-core";

type RouteContext = { params: Promise<{ instanceId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const agent = await authenticateAgentApiKey(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { instanceId } = await context.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await appendAgentInstanceLogs(agent.host, instanceId, json);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, inserted: result.inserted });
}
