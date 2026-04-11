import type { AllocatedPorts } from "@/lib/allocated-ports";

export type PortTemplateDefaults = {
  baseGame: number;
  baseQuery: number;
  stride: number;
};

/**
 * Reads catalog `template.defaultPorts` (optional). Falls back to common SRCDS-style defaults.
 */
export function parseDefaultPortsFromTemplate(
  template: Record<string, unknown> | null | undefined
): PortTemplateDefaults {
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

export function collectUsedPorts(
  rows: { allocatedPorts: AllocatedPorts | null }[]
): Set<number> {
  const used = new Set<number>();
  for (const r of rows) {
    if (!r.allocatedPorts) {
      continue;
    }
    for (const v of Object.values(r.allocatedPorts)) {
      if (typeof v === "number" && Number.isInteger(v) && v > 0) {
        used.add(v);
      }
    }
  }
  return used;
}

/**
 * Picks the first non-colliding (game, query) pair by shifting both ports in parallel.
 */
export function allocateNextPortSet(
  used: Set<number>,
  defaults: PortTemplateDefaults
): AllocatedPorts {
  const { baseGame, baseQuery, stride } = defaults;
  const delta = baseQuery - baseGame;
  for (let k = 0; k < 10_000; k++) {
    const game = baseGame + k * stride;
    const query = baseQuery + k * stride;
    if (!used.has(game) && !used.has(query)) {
      const out: AllocatedPorts = { game, query };
      return out;
    }
  }
  throw new Error(
    "Could not allocate ports: too many instances on this host (port space exhausted)."
  );
}
