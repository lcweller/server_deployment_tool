import { createConnection, type Socket } from "node:net";

export type TcpProbeResult = "open" | "refused" | "timeout" | "error";

/**
 * Attempts a single outbound TCP connection from this Node process to host:port.
 * Used only for user-visible “can the internet reach my forwarded port?” hints — not a full port scan.
 */
export function probeTcpPort(
  host: string,
  port: number,
  timeoutMs = 4500
): Promise<TcpProbeResult> {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return Promise.resolve("error");
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: TcpProbeResult) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(r);
    };

    let sock: Socket;
    try {
      sock = createConnection({ host, port }, () => {
        try {
          sock.destroy();
        } catch {
          /* ignore */
        }
        finish("open");
      });
    } catch {
      finish("error");
      return;
    }

    sock.setTimeout(timeoutMs);

    sock.on("error", (err: NodeJS.ErrnoException) => {
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      if (err.code === "ECONNREFUSED" || err.code === "ECONNRESET") {
        finish("refused");
        return;
      }
      if (err.code === "ETIMEDOUT") {
        finish("timeout");
        return;
      }
      finish("error");
    });

    sock.on("timeout", () => {
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      finish("timeout");
    });
  });
}
