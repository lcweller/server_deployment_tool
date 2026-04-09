/**
 * Remote provisioning: real SteamCMD by default; stub only if STEAMLINE_PROVISION_STUB=1.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { ensureSteamCmd } from "./steamcmd-bootstrap";
import { writeSteamlinePid } from "./pidfile";

export type RemoteInstance = {
  id: string;
  name: string;
  status: string;
  steamAppId: string | null;
  slug: string | null;
};

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function instanceDataDir(instanceId: string): string {
  const root =
    process.env.STEAMLINE_INSTANCE_ROOT ??
    path.join(process.cwd(), "steamline-data", "instances", instanceId);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

async function runSteamCmdInstall(
  appId: string,
  installDir: string
): Promise<{ code: number; tail: string[] }> {
  const launch = await ensureSteamCmd();
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
      env: { ...process.env },
    });
    child.stdout?.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const tail = buf
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(-60);
      resolve({ code: code ?? 1, tail });
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
    await postLogs(apiBase, bearer, inst.id, [
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
    const { code, tail } = await runSteamCmdInstall(inst.steamAppId, dir);

    if (tail.length) {
      await postLogs(apiBase, bearer, inst.id, tail);
    }

    if (code === 0) {
      const startCmd = process.env.STEAMLINE_AFTER_INSTALL_CMD?.trim();
      if (startCmd) {
        await postLogs(apiBase, bearer, inst.id, [
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
            await postLogs(apiBase, bearer, inst.id, [
              `[steamline] Wrote steamline.pid for pid ${child.pid} (stop via dashboard delete).`,
            ]);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await postLogs(apiBase, bearer, inst.id, [
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
      await postStatus(apiBase, bearer, inst.id, {
        status: "failed",
        message: `SteamCMD exited with code ${code}. See instance logs.`,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await postLogs(apiBase, bearer, inst.id, [`[steamline] error: ${msg}`]);
    await postStatus(apiBase, bearer, inst.id, {
      status: "failed",
      message: msg,
    });
  }
}
