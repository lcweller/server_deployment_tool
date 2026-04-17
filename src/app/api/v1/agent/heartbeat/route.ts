import { NextResponse } from "next/server";

import { runAgentHeartbeatFromJson } from "@/lib/agent/heartbeat-core";
import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";

/**
 * REST heartbeat (fallback when WebSocket is unavailable). WebSocket path: `/api/v1/agent/ws`.
 */
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

  const result = await runAgentHeartbeatFromJson(agent.host, json);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json(result.response);
}
