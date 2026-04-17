/**
 * Apply a root password from the dashboard (heartbeat delivery) on Linux.
 */
import { spawnSync } from "node:child_process";

export function applyLinuxRootPasswordFromHeartbeat(password: string): void {
  if (process.platform !== "linux") {
    return;
  }
  const input = `root:${password}\n`;
  const euid =
    typeof process.geteuid === "function" ? process.geteuid() : -1;

  const tryChpasswd = (argv: string[]) => {
    const r = spawnSync(argv[0]!, argv.slice(1), {
      input,
      encoding: "utf8",
    });
    return r.status === 0;
  };

  if (euid === 0) {
    if (tryChpasswd(["chpasswd"]) || tryChpasswd(["/usr/sbin/chpasswd"])) {
      console.error(
        "[steamline] Linux root password was updated from the dashboard (running as root)."
      );
      return;
    }
    console.error(
      "[steamline] chpasswd failed while applying a dashboard root-password change."
    );
    return;
  }

  if (
    tryChpasswd(["sudo", "-n", "chpasswd"]) ||
    tryChpasswd(["sudo", "-n", "/usr/sbin/chpasswd"])
  ) {
    console.error(
      "[steamline] Linux root password was updated from the dashboard (via sudo -n)."
    );
    return;
  }

  console.error(
    "[steamline] Could not apply dashboard root-password change — run the agent as root or configure passwordless sudo for chpasswd."
  );
}
