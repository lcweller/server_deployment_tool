import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { subscribeHostRealtime } from "@/lib/realtime/host-updates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events: dashboard subscribes to host update notifications (WebSocket heartbeats).
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.emailVerifiedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const encoder = new TextEncoder();
  const userId = user.id;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      send("ready", { userId });

      const unsubscribe = subscribeHostRealtime(userId, (payload) => {
        send("host", payload);
      });

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        } catch {
          clearInterval(keepAlive);
        }
      }, 25_000);

      const onAbort = () => {
        clearInterval(keepAlive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* closed */
        }
      };

      request.signal.addEventListener("abort", onAbort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
