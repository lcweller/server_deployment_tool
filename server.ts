import { EventEmitter } from "node:events";
import { createServer, type IncomingMessage, type Server as HttpServer } from "node:http";
import { parse } from "node:url";
import type { Duplex } from "node:stream";
import next from "next";

import { createAgentWebSocketUpgradeHandler } from "./src/server/agent-ws-upgrade";
import { createBrowserTerminalWebSocketUpgradeHandler } from "./src/server/browser-terminal-ws-upgrade";

const dev = process.env.NODE_ENV !== "production";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

/**
 * Next's custom-server wrapper registers its own `upgrade` listener on
 * `options.httpServer` (or else on `req.socket.server`). If we omit this, Next
 * attaches to the real HTTP server alongside our router and both try to
 * complete the same WebSocket handshake — breaking dev HMR (`/_next/webpack-hmr`)
 * and leaving the client bundle disconnected (no hydration).
 *
 * This emitter never receives real sockets; it only absorbs Next's listener.
 */
const nextWebSocketAttachmentSink = new EventEmitter() as unknown as HttpServer;

const app = next({ dev, httpServer: nextWebSocketAttachmentSink });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    void handle(req, res, parsedUrl);
  });

  const tryAgentUpgrade = createAgentWebSocketUpgradeHandler();
  const tryTerminalUpgrade = createBrowserTerminalWebSocketUpgradeHandler();
  /**
   * `getUpgradeHandler()` on the custom-server wrapper forwards to the inner
   * `NextServer`, whose `handleUpgrade` is intentionally empty. The real dev HMR
   * and `/_next` upgrade routing live on `upgradeHandler` populated by `prepare()`
   * (same function Next wires when it attaches to `httpServer`).
   */
  const nextUpgradeHandler = dev
    ? (
        app as unknown as {
          upgradeHandler: (
            req: IncomingMessage,
            socket: Duplex,
            head: Buffer
          ) => Promise<void>;
        }
      ).upgradeHandler
    : null;

  /**
   * Exactly one `upgrade` listener on the real HTTP server. Await the async
   * Next handler so the WebSocket handshake finishes before this listener returns.
   */
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    void (async () => {
      const host = req.headers.host ?? "localhost";
      let pathname: string;
      try {
        pathname = new URL(req.url ?? "/", `http://${host}`).pathname;
      } catch {
        socket.destroy();
        return;
      }

      if (dev && nextUpgradeHandler && pathname.startsWith("/_next/")) {
        try {
          await nextUpgradeHandler(req, socket, head);
        } catch (err) {
          console.error("[steamline] Next.js WebSocket upgrade failed:", err);
          try {
            socket.destroy();
          } catch {
            /* ignore */
          }
        }
        return;
      }

      if (tryAgentUpgrade(req, socket, head)) return;
      if (tryTerminalUpgrade(req, socket, head)) return;

      socket.destroy();
    })();
  });

  server.listen(port, hostname, () => {
    console.error(
      `[steamline] HTTP + WebSockets (agent + terminal) on http://${hostname}:${port}`
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
