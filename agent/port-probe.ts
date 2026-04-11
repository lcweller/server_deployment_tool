/**
 * Verify chosen ports are free on this machine (TCP + UDP bind).
 * If something else is listening, shift by stride until a pair works.
 */
import * as dgram from "node:dgram";
import * as net from "node:net";

type PortTriple = {
  game?: number;
  query?: number;
  rcon?: number;
};

function parseStride(template: Record<string, unknown> | null | undefined): {
  baseGame: number;
  baseQuery: number;
  stride: number;
} {
  const raw = template?.defaultPorts;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const baseGame = typeof o.game === "number" ? o.game : 27_015;
    const baseQuery =
      typeof o.query === "number" ? o.query : baseGame + 1;
    const stride = typeof o.stride === "number" ? o.stride : 2;
    return { baseGame, baseQuery, stride };
  }
  return { baseGame: 27_015, baseQuery: 27_016, stride: 2 };
}

function tryTcp(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(port, "0.0.0.0", () => {
      s.close(() => resolve(true));
    });
  });
}

function tryUdp(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = dgram.createSocket("udp4");
    s.once("error", () => {
      try {
        s.close();
      } catch {
        /* ignore */
      }
      resolve(false);
    });
    s.bind(port, "0.0.0.0", () => {
      s.close(() => resolve(true));
    });
  });
}

async function portFree(port: number): Promise<boolean> {
  const tcp = await tryTcp(port);
  if (!tcp) {
    return false;
  }
  const udp = await tryUdp(port);
  return udp;
}

async function pairFree(game?: number, query?: number): Promise<boolean> {
  const ports = [
    ...new Set(
      [game, query].filter(
        (p): p is number => typeof p === "number" && p > 0
      )
    ),
  ];
  for (const p of ports) {
    if (!(await portFree(p))) {
      return false;
    }
  }
  return true;
}

/**
 * Ensures API-allocated ports are actually bindable; if not (non-Steamline process),
 * shifts game+query in parallel until a free pair is found.
 */
export async function resolvePortsWithLocalProbe(
  desired: PortTriple | null | undefined,
  template: Record<string, unknown> | null | undefined
): Promise<{ ports: PortTriple; adjusted: boolean }> {
  const { baseGame, baseQuery, stride } = parseStride(template);
  const startGame = desired?.game ?? baseGame;
  const startQuery = desired?.query ?? startGame + (baseQuery - baseGame);
  const spacing = startQuery - startGame;

  for (let k = 0; k < 200; k++) {
    const game = startGame + k * stride;
    const query = game + spacing;
    if (await pairFree(game, query)) {
      const origG = desired?.game ?? startGame;
      const origQ = desired?.query ?? origG + spacing;
      const adjusted = game !== origG || query !== origQ;
      const ports: PortTriple = { game, query };
      if (typeof desired?.rcon === "number") {
        const baselineGame = desired.game ?? startGame;
        ports.rcon = desired.rcon + (game - baselineGame);
      }
      return { ports, adjusted };
    }
  }

  throw new Error(
    "No free game/query ports on this host after probing TCP and UDP (200 attempts)."
  );
}

export function formatPortEnv(
  inst: { id: string; name: string },
  installDir: string,
  ports: PortTriple
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    STEAMLINE_INSTANCE_ID: inst.id,
    STEAMLINE_INSTANCE_NAME: inst.name,
    STEAMLINE_INSTALL_DIR: installDir,
    STEAMLINE_PORTS_JSON: JSON.stringify(ports),
  };
  if (ports.game != null) {
    env.STEAMLINE_GAME_PORT = String(ports.game);
  }
  if (ports.query != null) {
    env.STEAMLINE_QUERY_PORT = String(ports.query);
  }
  if (ports.rcon != null) {
    env.STEAMLINE_RCON_PORT = String(ports.rcon);
  }
  return env;
}
