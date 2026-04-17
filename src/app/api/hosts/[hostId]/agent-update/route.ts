import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { hosts } from "@/db/schema";
import {
  buildAgentReleaseManifest,
  getPublishedAgentSemver,
} from "@/lib/agent-release";
import { listRecentHostAgentUpdateEvents } from "@/lib/agent-update-events";
import { compareSemver } from "@/lib/semver-cmp";
import { requireVerifiedUser } from "@/lib/auth/require-verified";
import { sendControlToAgent } from "@/server/agent-socket-registry";

type RouteCtx = { params: Promise<{ hostId: string }> };

const PREFIX = "steamline-agent/";

function parseInstalledSemver(label: string | null): string | null {
  if (!label?.trim()) {
    return null;
  }
  const t = label.trim();
  if (t.startsWith(PREFIX)) {
    return t.slice(PREFIX.length) || null;
  }
  return t;
}

export async function GET(request: Request, ctx: RouteCtx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { hostId } = await ctx.params;

  const rows = await db
    .select({
      agentVersion: hosts.agentVersion,
    })
    .from(hosts)
    .where(and(eq(hosts.id, hostId), eq(hosts.userId, auth.user.id)))
    .limit(1);

  if (!rows[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const manifest = buildAgentReleaseManifest(request);
  const latestSemver = getPublishedAgentSemver();
  const installedSemver = parseInstalledSemver(rows[0].agentVersion);
  let updateAvailable = false;
  if (manifest && installedSemver) {
    updateAvailable = compareSemver(latestSemver, installedSemver) > 0;
  } else if (manifest && !installedSemver) {
    updateAvailable = true;
  }

  const history = await listRecentHostAgentUpdateEvents(hostId, 25);
  const lastEvent = history[0]
    ? {
        phase: history[0].phase,
        message: history[0].message ?? undefined,
        at: history[0].at,
      }
    : null;

  return NextResponse.json({
    artifactReady: Boolean(manifest),
    installedSemver,
    latestSemver,
    releaseNotes: manifest?.releaseNotes ?? null,
    minAgentVersion: manifest?.minAgentVersion ?? null,
    updateAvailable,
    lastEvent,
    history: history.map((h) => ({
      phase: h.phase,
      message: h.message ?? undefined,
      at: h.at,
    })),
  });
}

const postSchema = z.object({
  action: z.enum(["apply", "check"]),
  targetVersion: z.string().optional(),
});

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { hostId } = await ctx.params;

  const rows = await db
    .select({ id: hosts.id })
    .from(hosts)
    .where(and(eq(hosts.id, hostId), eq(hosts.userId, auth.user.id)))
    .limit(1);

  if (!rows[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const action = parsed.data.action;
  const payload: Record<string, unknown> =
    action === "apply"
      ? {
          action: "apply_agent_update",
          ...(parsed.data.targetVersion
            ? { targetVersion: parsed.data.targetVersion }
            : {}),
        }
      : { action: "check_agent_update" };

  const ok = sendControlToAgent(hostId, payload);

  if (!ok) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "The agent is not connected over the real-time channel. Connect the agent or wait for WebSocket, then retry.",
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true });
}
