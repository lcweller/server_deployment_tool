/**
 * Per-instance install directory — must match provision, pidfile, and cleanup.
 *
 * `STEAMLINE_INSTANCE_ROOT` is the **parent** directory (one subfolder per instance UUID).
 */
import * as path from "node:path";

export function instanceInstallDir(instanceId: string): string {
  const parent =
    process.env.STEAMLINE_INSTANCE_ROOT ??
    path.join(process.cwd(), "steamline-data", "instances");
  return path.join(parent, instanceId);
}
