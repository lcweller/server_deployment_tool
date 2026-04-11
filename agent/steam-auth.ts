import * as fs from "node:fs";

import { launchPresetFor } from "./launch-presets";

/** Minimal instance shape for SteamCMD login resolution (keeps this module free of `provision` cycles). */
export type SteamLoginInstanceRef = {
  steamAppId: string | null;
  template?: Record<string, unknown> | null;
};

export type SteamCmdLoginPlan =
  | { kind: "anonymous" }
  | { kind: "steam"; user: string; pass: string; guard?: string }
  | { kind: "missing_creds"; reason: string };

function readSteamPasswordFromFile(filePath: string): string | undefined {
  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    const line = raw.split(/\r?\n/).find((l) => l.trim().length > 0);
    return line?.trim();
  } catch {
    return undefined;
  }
}

/** Password for SteamCMD — never log this value. */
export function readSteamPassword(): string | undefined {
  const fromEnv = process.env.STEAMLINE_STEAM_PASSWORD?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const file = process.env.STEAMLINE_STEAM_PASSWORD_FILE?.trim();
  if (file) {
    return readSteamPasswordFromFile(file);
  }
  return undefined;
}

function templateWantsSteamLogin(
  template: Record<string, unknown> | null | undefined
): boolean {
  const m = template?.loginMode;
  return m === "steam" || m === "steam_user";
}

export function instanceRequiresSteamAccount(inst: SteamLoginInstanceRef): boolean {
  if (process.env.STEAMLINE_STEAMCM_FORCE_LOGIN === "1") {
    return true;
  }
  if (templateWantsSteamLogin(inst.template ?? undefined)) {
    return true;
  }
  const preset = launchPresetFor(inst.steamAppId);
  return preset?.requiresSteamLogin === true;
}

function envSteamCreds():
  | { user: string; pass: string; guard?: string }
  | undefined {
  const user = process.env.STEAMLINE_STEAM_USERNAME?.trim();
  const pass = readSteamPassword();
  if (!user || !pass) {
    return undefined;
  }
  const guard = process.env.STEAMLINE_STEAM_GUARD_CODE?.trim();
  return guard ? { user, pass, guard } : { user, pass };
}

/**
 * Resolves how SteamCMD should authenticate for `app_update`.
 * Missing credentials for a licensed title returns `missing_creds` so the caller can fail loudly.
 */
export function resolveSteamCmdLoginPlan(inst: SteamLoginInstanceRef): SteamCmdLoginPlan {
  const creds = envSteamCreds();
  if (creds) {
    return { kind: "steam", ...creds };
  }
  if (instanceRequiresSteamAccount(inst)) {
    return {
      kind: "missing_creds",
      reason:
        "This Steam App ID is configured for a licensed SteamCMD install. Set STEAMLINE_STEAM_USERNAME plus STEAMLINE_STEAM_PASSWORD (or STEAMLINE_STEAM_PASSWORD_FILE) on the host, optionally STEAMLINE_STEAM_GUARD_CODE for email Guard on this run. Run `steamline-agent.cjs steam-login` once on the host for interactive Steam Guard. Passwords are never stored in the dashboard database.",
    };
  }
  return { kind: "anonymous" };
}
