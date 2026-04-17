import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";

import { attachAgentWebSocketServer } from "./src/server/attach-agent-ws";
import { attachBrowserTerminalWebSocket } from "./src/server/attach-browser-terminal-ws";

const dev = process.env.NODE_ENV !== "production";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  const parsedUrl = parse(req.url ?? "/", true);
  void handle(req, res, parsedUrl);
});

attachAgentWebSocketServer(server);
attachBrowserTerminalWebSocket(server);

server.listen(port, hostname, () => {
  console.error(
    `[steamline] HTTP + WebSockets (agent + terminal) on http://${hostname}:${port}`
  );
});
