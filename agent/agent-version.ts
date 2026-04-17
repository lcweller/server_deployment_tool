/**
 * Semver for this agent process. The bundled `steamline-agent.cjs` sets
 * `globalThis.__STEAMLINE_AGENT_SEMVER__` in its banner; dev (`tsx`) reads package.json.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PREFIX = "steamline-agent/";

function readDevSemver(): string {
  try {
    const pkgPath = join(__dirname, "..", "package.json");
    const j = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return j.version ?? "0.0.0-dev";
  } catch {
    return "0.0.0-dev";
  }
}

/** Semver only, e.g. `0.1.0` (no prefix). */
export function getAgentVersionSemver(): string {
  const g = globalThis as { __STEAMLINE_AGENT_SEMVER__?: string };
  const v = g.__STEAMLINE_AGENT_SEMVER__;
  if (typeof v === "string" && v.length > 0) {
    return v;
  }
  return readDevSemver();
}

/** Full label stored in the control plane, e.g. `steamline-agent/0.1.0`. */
export function getAgentVersionLabel(): string {
  return `${PREFIX}${getAgentVersionSemver()}`;
}

/** Strip `steamline-agent/` prefix if present. */
export function parseSemverFromAgentVersionLabel(label: string | null | undefined): string | null {
  if (!label?.trim()) {
    return null;
  }
  const t = label.trim();
  if (t.startsWith(PREFIX)) {
    return t.slice(PREFIX.length) || null;
  }
  return t;
}
