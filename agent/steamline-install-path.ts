import { homedir } from "node:os";
import * as path from "node:path";

/** Matches `install-agent.sh` default `STEAMLINE_HOME` / `~/.steamline`. */
export function steamlineInstallRoot(): string {
  const h = process.env.STEAMLINE_HOME?.trim();
  if (h) {
    return path.isAbsolute(h) ? h : path.resolve(process.cwd(), h);
  }
  return path.join(homedir(), ".steamline");
}

export function steamlineAgentEnvPath(): string {
  return path.join(steamlineInstallRoot(), "steamline-agent.env");
}
