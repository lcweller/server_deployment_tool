/**
 * Dashboard re-export of agent launch presets (Steam App ID → start hints).
 * Source of truth: `agent/launch-presets.ts` (bundled into the host agent).
 */
export {
  LAUNCH_PRESETS,
  launchPresetFor,
  resolvePresetShellCommand,
  type LaunchPreset,
} from "../../agent/launch-presets";
