import { spawn } from "node:child_process";

import { ensureSteamCmd } from "./steamcmd-bootstrap";

const DEFAULT_PATH =
  "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

/**
 * Opens SteamCMD with a TTY so the operator can run `login <user>` and complete Steam Guard.
 * Sentry files live under the host SteamCMD cache — the same tree used for provisioning.
 */
export async function runInteractiveSteamLogin(
  baseUrl?: string
): Promise<void> {
  let hint = "";
  if (baseUrl?.trim() && process.env.STEAMLINE_API_KEY) {
    try {
      const u = `${baseUrl.replace(/\/$/, "")}/api/v1/agent/host`;
      const res = await fetch(u, {
        headers: { Authorization: `Bearer ${process.env.STEAMLINE_API_KEY}` },
      });
      if (res.ok) {
        const j = (await res.json()) as {
          host?: { steamUsername?: string | null };
        };
        if (j.host?.steamUsername) {
          hint = `\nDashboard saved Steam username for this host: ${j.host.steamUsername}\n`;
        }
      }
    } catch {
      /* ignore */
    }
  }

  console.error(
    "[steamline] Starting interactive SteamCMD." +
      hint +
      "\nAt the Steam> prompt use: login <username>\n" +
      "Then complete Steam Guard if prompted. Type `quit` when done.\n" +
      "Credentials are not sent to the Steamline API — they stay between you and Valve.\n"
  );

  const ensured = await ensureSteamCmd();
  const { launch } = ensured;

  await new Promise<void>((resolve, reject) => {
    const child = spawn(launch.command, launch.leadArgs, {
      cwd: launch.steamcmdDir,
      stdio: "inherit",
      env: {
        ...process.env,
        PATH:
          process.env.PATH && process.env.PATH.length > 0
            ? process.env.PATH
            : DEFAULT_PATH,
      },
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`SteamCMD exited with code ${code ?? 1}`));
      }
    });
  });
}
