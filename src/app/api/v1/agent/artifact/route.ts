import { NextResponse } from "next/server";

import { authenticateAgentApiKey } from "@/lib/auth/agent-api-key";
import {
  checksumSha256OfBuffer,
  getPublishedAgentSemver,
  loadAgentArtifactByVersion,
} from "@/lib/agent-release";

export async function GET(request: Request) {
  const agent = await authenticateAgentApiKey(request);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get("version")?.trim();
  const published = getPublishedAgentSemver();
  if (!requested) {
    return NextResponse.json(
      {
        error: `Missing version query parameter (current ${published}).`,
      },
      { status: 400 }
    );
  }

  const buf = loadAgentArtifactByVersion(requested);
  if (!buf) {
    return NextResponse.json(
      { error: `Unknown version ${requested} on this server.` },
      { status: 404 }
    );
  }

  const etag = `"${checksumSha256OfBuffer(buf).slice(0, 16)}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304 });
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="steamline-agent-${requested}.cjs"`,
      "Cache-Control": "public, max-age=300",
      ETag: etag,
    },
  });
}
