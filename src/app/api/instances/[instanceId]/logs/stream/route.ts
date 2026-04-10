import { and, asc, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { instanceLogLines, serverInstances } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ instanceId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user || !user.emailVerifiedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { instanceId } = await context.params;
  const url = new URL(request.url);
  let after = Number(url.searchParams.get("after") ?? "0");
  if (!Number.isFinite(after) || after < 0) {
    after = 0;
  }

  const inst = await db
    .select()
    .from(serverInstances)
    .where(eq(serverInstances.id, instanceId))
    .limit(1);

  const row = inst[0];
  if (!row || row.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      send("ready", { instanceId });

      const poll = async () => {
        try {
          const lines = await db
            .select()
            .from(instanceLogLines)
            .where(
              and(
                eq(instanceLogLines.instanceId, instanceId),
                gt(instanceLogLines.id, after)
              )
            )
            .orderBy(asc(instanceLogLines.id))
            .limit(2000);

          for (const line of lines) {
            after = line.id;
            send("log", { id: line.id, line: line.line, at: line.createdAt });
          }
        } catch (e) {
          send("error", { message: String(e) });
        }
      };

      await poll();
      const timer = setInterval(poll, 1000);

      request.signal.addEventListener("abort", () => {
        clearInterval(timer);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
