import * as fs from "node:fs";
import * as path from "node:path";

import { steamlineAgentEnvPath } from "./steamline-install-path";

export type DeliveredSteamCredentials = {
  steamUsername: string;
  steamPassword: string;
  steamGuardCode?: string;
};

function escapeEnvValue(val: string): string {
  if (!/[\s#"'=]/.test(val)) {
    return val;
  }
  return `"${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function formatLine(key: string, val: string): string {
  return `${key}=${escapeEnvValue(val)}`;
}

/**
 * Merges SteamCMD variables into `steamline-agent.env` and applies them to this process
 * so provisioning can run without restarting the agent loop.
 */
export function persistSteamCredentialsFromDelivery(
  creds: DeliveredSteamCredentials
): void {
  const envPath = steamlineAgentEnvPath();
  fs.mkdirSync(path.dirname(envPath), { recursive: true });

  let prior = "";
  try {
    prior = fs.readFileSync(envPath, "utf8");
  } catch {
    prior = "";
  }

  const dropKeys = new Set([
    "STEAMLINE_STEAM_USERNAME",
    "STEAMLINE_STEAM_PASSWORD",
    "STEAMLINE_STEAM_GUARD_CODE",
  ]);

  const linesOut: string[] = [];
  for (const line of prior.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) {
      linesOut.push(line);
      continue;
    }
    const eq = t.indexOf("=");
    if (eq < 1) {
      linesOut.push(line);
      continue;
    }
    const k = t.slice(0, eq).trim();
    if (dropKeys.has(k)) {
      continue;
    }
    linesOut.push(line);
  }

  while (linesOut.length > 0 && linesOut[linesOut.length - 1] === "") {
    linesOut.pop();
  }

  const block = [
    "",
    "# --- Pushed from Steamline dashboard (do not share this file) ---",
    formatLine("STEAMLINE_STEAM_USERNAME", creds.steamUsername),
    formatLine("STEAMLINE_STEAM_PASSWORD", creds.steamPassword),
  ];
  if (creds.steamGuardCode?.trim()) {
    block.push(
      formatLine("STEAMLINE_STEAM_GUARD_CODE", creds.steamGuardCode.trim())
    );
  }

  const next = [...linesOut, ...block].join("\n").replace(/\n{3,}/g, "\n\n");
  fs.writeFileSync(envPath, next.endsWith("\n") ? next : `${next}\n`, "utf8");

  try {
    fs.chmodSync(envPath, 0o600);
  } catch {
    /* Windows / permissions */
  }

  process.env.STEAMLINE_STEAM_USERNAME = creds.steamUsername;
  process.env.STEAMLINE_STEAM_PASSWORD = creds.steamPassword;
  if (creds.steamGuardCode?.trim()) {
    process.env.STEAMLINE_STEAM_GUARD_CODE = creds.steamGuardCode.trim();
  } else {
    delete process.env.STEAMLINE_STEAM_GUARD_CODE;
  }
}
