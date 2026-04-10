/**
 * Remote provisioning: real SteamCMD by default; stub only if STEAMLINE_PROVISION_STUB=1.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";

import {
  collectSteamCmdDiagnostics,
  ensureSteamCmd,
  type SteamCmdLaunch,
} from "./steamcmd-bootstrap";
import { instanceInstallDir } from "./paths";
import { writeSteamlinePid } from "./pidfile";

export type RemoteInstance = {
  id: string;
  name: string;
  status: string;
  steamAppId: string | null;
  slug: string | null;
};

const LOG_CHUNK = 450;

function base(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

async function postJson(
  url: string,
  init: RequestInit & { bearer: string }
): Promise<{ ok: boolean; status: number; text: string }> {
  const { bearer, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
      ...(rest.headers as Record<string, string>),
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function postStatus(
  apiBase: string,
  bearer: string,
  instanceId: string,
  body: Record<string, string>
): Promise<void> {
  const url = `${base(apiBase)}/api/v1/agent/instances/${instanceId}/status`;
  const r = await postJson(url, {
    method: "POST",
    bearer,
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`status ${r.status}: ${r.text}`);
  }
}

async function postLogs(
  apiBase: string,
  bearer: string,
  instanceId: string,
  lines: string[]
): Promise<void> {
  const url = `${base(apiBase)}/api/v1/agent/instances/${instanceId}/logs`;
  const r = await postJson(url, {
    method: "POST",
    bearer,
    body: JSON.stringify({ lines }),
  });
  if (!r.ok) {
    throw new Error(`logs ${r.status}: ${r.text}`);
  }
}

/** Agent API accepts up to 500 lines per POST — chunk for long SteamCMD output. */
async function postLogLines(
  apiBase: string,
  bearer: string,
  instanceId: string,
  lines: string[]
): Promise<void> {
  for (let i = 0; i < lines.length; i += LOG_CHUNK) {
    await postLogs(apiBase, bearer, instanceId, lines.slice(i, i + LOG_CHUNK));
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function instanceDataDir(instanceId: string): string {
  const root = instanceInstallDir(instanceId);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

const DEFAULT_PATH =
  "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

async function runSteamCmdWithCapture(
  launch: SteamCmdLaunch,
  appId: string,
  installDir: string
): Promise<{ code: number; allLines: string[] }> {
  const steamArgs = [
    "+force_install_dir",
    installDir,
    "+login",
    "anonymous",
    "+app_update",
    appId,
    "validate",
    "+quit",
  ];
  const allArgs = [...launch.leadArgs, ...steamArgs];

  return new Promise((resolve, reject) => {
    let buf = "";
    const child = spawn(launch.command, allArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH:
          process.env.PATH && process.env.PATH.length > 0
            ? process.env.PATH
            : DEFAULT_PATH,
      },
    });
    child.stdout?.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const allLines = buf.split("\n").map((s) => s.trimEnd());
      resolve({ code: code ?? 1, allLines });
    });
  });
}

/**
 * Provision one `queued` instance: installing → (running | failed).
 */
export async function provisionInstance(
  apiBase: string,
  bearer: string,
  inst: RemoteInstance
): Promise<void> {
  if (inst.status !== "queued") {
    return;
  }

  const stub = process.env.STEAMLINE_PROVISION_STUB === "1";

  await postStatus(apiBase, bearer, inst.id, {
    status: "installing",
    message: stub
      ? "Stub provision (STEAMLINE_PROVISION_STUB=1)…"
      : "Downloading/running SteamCMD (anonymous)…",
  });

  if (stub) {
    await sleep(600);
    await postLogLines(apiBase, bearer, inst.id, [
      "[steamline] STEAMLINE_PROVISION_STUB=1 — skipping real SteamCMD.",
    ]);
    await postStatus(apiBase, bearer, inst.id, {
      status: "running",
      message: "Stub finished.",
    });
    return;
  }

  if (!inst.steamAppId) {
    await postStatus(apiBase, bearer, inst.id, {
      status: "failed",
      message: "Catalog entry has no steam_app_id.",
    });
    return;
  }

  const dir = instanceDataDir(inst.id);

  try {
    const launch: SteamCmdLaunch = await ensureSteamCmd();

    await postLogLines(
      apiBase,
      bearer,
      inst.id,
      [
        "[steamline] --- pre-run diagnostics (share this when asking for support) ---",
        ...collectSteamCmdDiagnostics(launch),
      ]
    );

    const { code, allLines } = await runSteamCmdWithCapture(
      launch,
      inst.steamAppId,
      dir
    );

    const nonEmpty = allLines.filter((l) => l.length > 0);

    if (code === 0) {
      const tail = nonEmpty.slice(-150);
      if (tail.length) {
        await postLogLines(apiBase, bearer, inst.id, [
          "[steamline] SteamCMD stdout/stderr (tail):",
          ...tail,
        ]);
      }
    } else {
      const body =
        nonEmpty.length > 0
          ? nonEmpty
          : ["(no stdout/stderr captured — check agent process permissions and PATH)"];
      await postLogLines(apiBase, bearer, inst.id, [
        `[steamline] SteamCMD exited with code ${code}. Full output:`,
        ...body,
      ]);
      await postLogLines(apiBase, bearer, inst.id, [
        "[steamline] --- post-failure diagnostics ---",
        ...collectSteamCmdDiagnostics(launch),
      ]);
    }

    if (code === 0) {
      const startCmd = process.env.STEAMLINE_AFTER_INSTALL_CMD?.trim();
      if (startCmd) {
        await postLogLines(apiBase, bearer, inst.id, [
          "[steamline] Starting dedicated process (STEAMLINE_AFTER_INSTALL_CMD)…",
        ]);
        try {
          const child = spawn(startCmd, [], {
            cwd: dir,
            shell: true,
            detached: true,
            stdio: "ignore",
            env: { ...process.env },
          });
          child.unref();
          if (child.pid != null) {
            writeSteamlinePid(inst.id, child);
            await postLogLines(apiBase, bearer, inst.id, [
              `[steamline] Wrote steamline.pid for pid ${child.pid} (stop via dashboard delete).`,
            ]);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await postLogLines(apiBase, bearer, inst.id, [
            `[steamline] STEAMLINE_AFTER_INSTALL_CMD failed: ${msg}`,
          ]);
        }
      }
      await postStatus(apiBase, bearer, inst.id, {
        status: "running",
        message: startCmd
          ? `SteamCMD OK; dedicated command started. Install dir: ${dir}`
          : `SteamCMD finished (exit 0). Install dir: ${dir}`,
      });
    } else {
      const hint =
        code === 127
          ? " Exit 127 is often: missing /bin/bash, missing 32-bit dynamic linker (install libc6-i386 on Ubuntu/Debian amd64), or SteamCMD not executable. See full logs above — run the agent as root once on minimal hosts, or set STEAMLINE_BASH_PATH."
          : "";
      await postStatus(apiBase, bearer, inst.id, {
        status: "failed",
        message: `SteamCMD exited with code ${code}.${hint} See instance logs below for full SteamCMD output and diagnostics.`,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await postLogLines(apiBase, bearer, inst.id, [`[steamline] error: ${msg}`]);
    await postStatus(apiBase, bearer, inst.id, {
      status: "failed",
      message: msg,
    });
  }
}
