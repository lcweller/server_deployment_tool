/**
 * Dashboard-requested reboot — ack first, then schedule OS reboot.
 */
import { spawn } from "node:child_process";

function base(apiBase: string) {
  return apiBase.replace(/\/$/, "");
}

async function postRebootAck(apiBase: string, bearer: string): Promise<void> {
  const url = `${base(apiBase)}/api/v1/agent/reboot-ack`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`reboot-ack ${res.status}: ${t}`);
  }
}

export async function performDashboardReboot(
  apiBase: string,
  bearer: string
): Promise<void> {
  await postRebootAck(apiBase, bearer);

  const custom = process.env.STEAMLINE_REBOOT_CMD?.trim();
  if (custom) {
    const child = spawn(custom, [], {
      shell: true,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    console.error(
      "[steamline] STEAMLINE_REBOOT_CMD launched — host should reboot shortly."
    );
    return;
  }

  const child =
    process.platform === "win32"
      ? spawn(
          "shutdown",
          ["/r", "/t", "60", "/c", "Steamline dashboard reboot"],
          { detached: true, stdio: "ignore" }
        )
      : spawn(
          "shutdown",
          ["-r", "+1", "Steamline dashboard reboot"],
          { detached: true, stdio: "ignore" }
        );
  child.on("error", (err) => {
    console.error(
      "[steamline] shutdown failed (try STEAMLINE_REBOOT_CMD or run agent as root/Administrator):",
      err
    );
  });
  child.unref();
  console.error(
    process.platform === "win32"
      ? "[steamline] Scheduled reboot in 60s via shutdown /r (cancel with shutdown /a if needed)."
      : "[steamline] Scheduled reboot in 1 minute via shutdown -r +1 (cancel with shutdown -c if needed)."
  );
}
