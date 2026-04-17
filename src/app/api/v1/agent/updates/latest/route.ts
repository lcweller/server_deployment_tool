import { NextResponse } from "next/server";

import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";
import { buildAgentReleaseManifest } from "@/lib/agent-release";

export async function GET(request: Request) {
  const agent = await authenticateAgentApiKey(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const manifest = buildAgentReleaseManifest(request);
  if (!manifest) {
    return NextResponse.json(
      { error: "Agent artifact is not available on this server (build or deploy issue)." },
      { status: 503 }
    );
  }

  return NextResponse.json({
    version: manifest.version,
    previousVersion: manifest.previousVersion ?? null,
    downloadUrl: manifest.downloadUrl,
    checksumSha256: manifest.checksumSha256,
    releaseNotes: manifest.releaseNotes,
    minAgentVersion: manifest.minAgentVersion,
  });
}
