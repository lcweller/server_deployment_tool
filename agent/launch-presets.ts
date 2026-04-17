/**
 * Curated launch hints keyed by Steam App ID (string).
 * Applied after catalog `afterInstallCmd` is missing: preset shell command, else auto-launch
 * with merged `defaultLaunchArgs` (preset first, then catalog template).
 *
 * Paths are relative to the SteamCMD `+force_install_dir` root for that instance.
 * Expand `${STEAMLINE_*}` placeholders via the agent before spawn.
 */
export type LaunchPreset = {
  /** Short name for logs / UI */
  label: string;
  /**
   * When true, SteamCMD `app_update` for this App ID expects a real Steam login
   * (set STEAMLINE_STEAM_USERNAME + STEAMLINE_STEAM_PASSWORD or PASSWORD_FILE on the host).
   */
  requiresSteamLogin?: boolean;
  /** Single-line shell start when we know the layout (relative to install root). */
  afterInstallCmd?: string;
  /** Windows-specific start line (install root = cwd). */
  afterInstallCmdWin?: string;
  /** Linux-specific start line (install root = cwd). */
  afterInstallCmdLinux?: string;
  /** Appended after auto-detected dedicated binary; merged with catalog `defaultLaunchArgs`. */
  defaultLaunchArgs?: string;
};

export const LAUNCH_PRESETS: Record<string, LaunchPreset> = {
  /**
   * Half-Life Dedicated Server (GoldSrc). Must use `hlds_run` (sets library paths);
   * running `hlds_amd` / `hlds_i686` directly exits immediately.
   * Use catalog `defaultLaunchArgs` to switch mod, e.g. `-game cstrike +map de_dust2`.
   */
  "90": {
    label: "Half-Life Dedicated Server (GoldSrc)",
    afterInstallCmdLinux:
      "./hlds_run -game valve +ip 0.0.0.0 -port ${STEAMLINE_GAME_PORT} +map crossfire +maxplayers 16",
    afterInstallCmdWin:
      "hlds.exe -game valve +ip 0.0.0.0 -port ${STEAMLINE_GAME_PORT} +map crossfire +maxplayers 16",
  },
  /** Counter-Strike 2 — full client / server files (app_update 730). */
  "730": {
    label: "Counter-Strike 2",
    requiresSteamLogin: true,
    afterInstallCmdWin:
      "game\\bin\\win64\\cs2.exe -dedicated -usercon -console +ip 0.0.0.0 -port ${STEAMLINE_GAME_PORT} +map de_dust2",
    afterInstallCmdLinux:
      "./game/bin/linuxsteamrt64/cs2 -dedicated -usercon -console +ip 0.0.0.0 -port ${STEAMLINE_GAME_PORT} +map de_dust2",
  },
  /** Team Fortress 2 Dedicated Server */
  "232250": {
    label: "Team Fortress 2 Dedicated",
    defaultLaunchArgs:
      "-game tf -console +ip 0.0.0.0 -port ${STEAMLINE_GAME_PORT} +map cp_badlands +maxplayers 24",
  },
  /** Project Zomboid dedicated (example seed uses 380870). */
  "380870": {
    label: "Project Zomboid Dedicated",
    defaultLaunchArgs:
      "-servername Steamline -port ${STEAMLINE_GAME_PORT} -steamport1 ${STEAMLINE_QUERY_PORT}",
  },
  /** Valheim dedicated server */
  "896660": {
    label: "Valheim Dedicated",
    defaultLaunchArgs:
      "-nographics -batchmode -name Steamline -port ${STEAMLINE_GAME_PORT} -public 1",
  },
  /** Palworld dedicated server */
  "2394010": {
    label: "Palworld Dedicated",
    defaultLaunchArgs: "-port=${STEAMLINE_GAME_PORT} -publiclobby",
  },
  /** Rust dedicated server */
  "258550": {
    label: "Rust Dedicated",
    defaultLaunchArgs:
      "-batchmode +server.port ${STEAMLINE_GAME_PORT} +server.hostname Steamline +server.description Steamline",
  },
  /** Terraria PC dedicated */
  "105600": {
    label: "Terraria Dedicated",
    defaultLaunchArgs: "-port ${STEAMLINE_GAME_PORT} -steam",
  },
  /** Left 4 Dead 2 Dedicated */
  "222860": {
    label: "Left 4 Dead 2 Dedicated",
    defaultLaunchArgs:
      "-game left4dead2 -console +ip 0.0.0.0 -port ${STEAMLINE_GAME_PORT} +map c1m1_hotel",
  },
  /** Garry's Mod */
  "4020": {
    label: "Garry's Mod Dedicated",
    defaultLaunchArgs:
      "-game garrysmod -console +ip 0.0.0.0 -port ${STEAMLINE_GAME_PORT} +map gm_flatgrass +maxplayers 16",
  },
};

export function launchPresetFor(
  steamAppId: string | null | undefined
): LaunchPreset | undefined {
  if (!steamAppId) {
    return undefined;
  }
  return LAUNCH_PRESETS[steamAppId];
}

export function resolvePresetShellCommand(preset: LaunchPreset): string | undefined {
  if (preset.afterInstallCmd?.trim()) {
    return preset.afterInstallCmd.trim();
  }
  if (process.platform === "win32" && preset.afterInstallCmdWin?.trim()) {
    return preset.afterInstallCmdWin.trim();
  }
  if (process.platform === "linux" && preset.afterInstallCmdLinux?.trim()) {
    return preset.afterInstallCmdLinux.trim();
  }
  return undefined;
}
