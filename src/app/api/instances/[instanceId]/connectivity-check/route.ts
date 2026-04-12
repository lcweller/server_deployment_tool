import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { hosts, serverInstances } from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";
import { isHostHeartbeatFresh } from "@/lib/host-presence";
import { isProbeablePublicIpv4 } from "@/lib/connectivity/public-ipv4";
import { probeTcpPort, type TcpProbeResult } from "@/lib/connectivity/tcp-probe";

export const maxDuration = 25;

type RouteCtx = { params: Promise<{ instanceId: string }> };

type PortCheck = { port: number; label: string; result: TcpProbeResult };

/**
 * Best-effort inbound reachability hint: this server opens outbound TCP to the
 * host’s reported public IPv4 on the assigned game/query ports. Many games use
 * UDP for gameplay — see response disclaimer.
 */
export async function POST(_request: Request, ctx: RouteCtx) {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { instanceId } = await ctx.params;

  const rows = await db
    .select({
      status: serverInstances.status,
      allocatedPorts: serverInstances.allocatedPorts,
      hostMetrics: hosts.hostMetrics,
      hostLastSeenAt: hosts.lastSeenAt,
    })
    .from(serverInstances)
    .innerJoin(hosts, eq(serverInstances.hostId, hosts.id))
    .where(
      and(
        eq(serverInstances.id, instanceId),
        eq(serverInstances.userId, auth.user.id)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (row.status !== "running" && row.status !== "recovering") {
    return NextResponse.json(
      {
        error:
          "Run this check when the server is running (or automatically restarting) on the host.",
      },
      { status: 409 }
    );
  }

  if (!isHostHeartbeatFresh(row.hostLastSeenAt)) {
    return NextResponse.json(
      {
        error:
          "The host agent has not reported in recently, so the dashboard will not run a reachability check. Power the machine on or restore agent connectivity, then try again.",
        code: "HOST_OFFLINE",
      },
      { status: 409 }
    );
  }

  const pub = row.hostMetrics?.publicIpv4?.trim();
  if (!pub || !isProbeablePublicIpv4(pub)) {
    return NextResponse.json(
      {
        error:
          "No usable public IPv4 yet. Wait for the host agent heartbeat (the dashboard needs a normal internet-routable address, not a private LAN IP).",
      },
      { status: 409 }
    );
  }

  const ports = row.allocatedPorts;
  const jobs: Promise<PortCheck>[] = [];

  if (ports?.game != null) {
    jobs.push(
      probeTcpPort(pub, ports.game).then((result) => ({
        port: ports.game!,
        label: "game",
        result,
      }))
    );
  }
  if (ports?.query != null && ports.query !== ports.game) {
    jobs.push(
      probeTcpPort(pub, ports.query).then((result) => ({
        port: ports.query!,
        label: "query / Steam",
        result,
      }))
    );
  }

  if (jobs.length === 0) {
    return NextResponse.json(
      { error: "This server has no game or query port assigned yet." },
      { status: 409 }
    );
  }

  const checks = await Promise.all(jobs);

  const summaryParts = checks.map((c) => {
    const human =
      c.result === "open"
        ? "reachable (TCP)"
        : c.result === "refused"
          ? "closed or refused (TCP)"
          : c.result === "timeout"
            ? "no TCP answer (timeout)"
            : "could not test";
    return `${c.label} port ${c.port}: ${human}`;
  });

  const anyOpen = checks.some((c) => c.result === "open");
  const allTimeout = checks.every((c) => c.result === "timeout");

  let headline: string;
  if (anyOpen) {
    headline =
      "At least one TCP port responded from the internet — forwarding may be working for TCP.";
  } else if (allTimeout) {
    headline =
      "We could not get a TCP response on these ports. That often means the router is not forwarding yet, the game is UDP-only, or an ISP firewall is in the way.";
  } else {
    headline =
      "TCP did not show an open listener on the tested ports. Your game may still use UDP only, or the server process may not be listening on TCP.";
  }

  return NextResponse.json({
    ok: true,
    publicIpv4: pub,
    checks,
    headline,
    detail: summaryParts.join(" · "),
    disclaimer:
      "Steamline only checks TCP from our app server to your public IP. Many Source-style and survival games rely on UDP for gameplay — UDP cannot be fully verified this way. If TCP looks closed but friends can join in-game, you are fine.",
  });
}
