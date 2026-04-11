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
import { formatPortEnv, resolvePortsWithLocalProbe } from "./port-probe";
import { writeSteamlinePid } from "./pidfile";
import { applyWindowsFirewallForPorts } from "./windows-firewall";

export type RemoteInstance = {
  id: string;
  name: string;
  status: string;
  steamAppId: string | null;
  slug: string | null;
  /** From control plane — may be shifted after local bind probe */
  allocatedPorts?: {
    game?: number;
    query?: number;
    rcon?: number;
  } | null;
  template?: Record<string, unknown> | null;
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
  body: Record<string, unknown>
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

/** Replace `${VAR}` using process env (after port env is merged). */
function expandEnvPlaceholders(cmd: string, env: NodeJS.ProcessEnv): string {
  return cmd.replace(/\$\{([A-Za-z0-9_]+)\}/g, (_, key: string) => {
    const v = env[key];
    return v !== undefined && v !== "" ? String(v) : "";
  });
}

/** Host env wins; else catalog `template.afterInstallCmd`. */
function resolveStartCommand(inst: RemoteInstance): string | undefined {
  const envCmd = process.env.STEAMLINE_AFTER_INSTALL_CMD?.trim();
  if (envCmd) {
    return envCmd;
  }
  const raw = inst.template?.afterInstallCmd;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return undefined;
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
      : "Provisioning game files (SteamCMD is shared on this host — only the game update runs each time)…",
  });

  if (stub) {
    await sleep(600);
    await postLogLines(apiBase, bearer, inst.id, [
      "[steamline] STEAMLINE_PROVISION_STUB=1 — skipping real SteamCMD.",
    ]);
    const stubBody: Record<string, unknown> = {
      status: "running",
      message: "Stub finished.",
    };
    if (inst.allocatedPorts && Object.keys(inst.allocatedPorts).length > 0) {
      stubBody.allocatedPorts = inst.allocatedPorts;
    }
    await postStatus(apiBase, bearer, inst.id, stubBody);
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
    const ensured = await ensureSteamCmd();
    const launch: SteamCmdLaunch = ensured.launch;

    await postLogLines(apiBase, bearer, inst.id, [
      ensured.cacheHit
        ? "[steamline] SteamCMD is already on this machine — not re-downloading the SteamCMD archive. Running app_update for this instance only."
        : "[steamline] First-time SteamCMD setup on this machine — downloaded and extracted Valve SteamCMD once; later servers reuse it.",
    ]);

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
      let resolvedPorts = inst.allocatedPorts ?? null;
      let portsAdjusted = false;
      try {
        const probe = await resolvePortsWithLocalProbe(
          inst.allocatedPorts ?? undefined,
          inst.template ?? undefined
        );
        resolvedPorts = probe.ports;
        portsAdjusted = probe.adjusted;
        if (portsAdjusted) {
          await postLogLines(apiBase, bearer, inst.id, [
            `[steamline] Local bind probe chose different ports than the dashboard (another program may be using the original ports): game=${resolvedPorts.game ?? "—"} query=${resolvedPorts.query ?? "—"}`,
          ]);
        } else {
          await postLogLines(apiBase, bearer, inst.id, [
            `[steamline] Network ports verified free (TCP+UDP): game=${resolvedPorts.game ?? "—"} query=${resolvedPorts.query ?? "—"}`,
          ]);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await postLogLines(apiBase, bearer, inst.id, [
          `[steamline] Port probe could not run (${msg}). Using control-plane ports from the dashboard.`,
        ]);
        resolvedPorts = inst.allocatedPorts ?? {
          game: 27_015,
          query: 27_016,
        };
      }

      const portEnv = formatPortEnv(inst, dir, resolvedPorts ?? {});
      const fwLines = applyWindowsFirewallForPorts(inst.id, dir, resolvedPorts ?? {});
      if (fwLines.length > 0) {
        await postLogLines(apiBase, bearer, inst.id, [
          "[steamline] Windows Firewall (best effort — agent may need Administrator):",
          ...fwLines,
        ]);
      }

      const startCmdRaw = resolveStartCommand(inst);
      const startCmd = startCmdRaw
        ? expandEnvPlaceholders(startCmdRaw, portEnv)
        : undefined;
      if (startCmd) {
        const src = process.env.STEAMLINE_AFTER_INSTALL_CMD?.trim()
          ? "STEAMLINE_AFTER_INSTALL_CMD"
          : "catalog template.afterInstallCmd";
        await postLogLines(apiBase, bearer, inst.id, [
          `[steamline] Starting dedicated process (${src})…`,
          "[steamline] Environment includes STEAMLINE_GAME_PORT, STEAMLINE_QUERY_PORT, STEAMLINE_INSTALL_DIR, STEAMLINE_PORTS_JSON (and %STEAMLINE_*% expands on Windows cmd).",
        ]);
        try {
          const child = spawn(startCmd, [], {
            cwd: dir,
            shell: true,
            detached: true,
            stdio: "ignore",
            env: portEnv,
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
            `[steamline] Start command failed: ${msg}`,
          ]);
        }
      } else {
        await postLogLines(apiBase, bearer, inst.id, [
          "[steamline] No start command: set STEAMLINE_AFTER_INSTALL_CMD on the host or add template.afterInstallCmd in the catalog for this game.",
        ]);
      }
      const statusBody: Record<string, unknown> = {
        status: "running",
        message: startCmd
          ? `SteamCMD OK; dedicated command started. Install dir: ${dir}`
          : `SteamCMD finished (exit 0). No dedicated start command configured. Install dir: ${dir}`,
      };
      if (resolvedPorts && Object.keys(resolvedPorts).length > 0) {
        statusBody.allocatedPorts = resolvedPorts;
      }
      await postStatus(apiBase, bearer, inst.id, statusBody);
    } else {
      const hint =
        code === 127
          ? ' If logs show steamcmd.sh + "cannot execute: required file not found" for linux32/steamcmd, the 32-bit ELF loader is missing (usually /lib/ld-linux.so.2). As root: apt-get install -y libc6-i386 (after dpkg --add-architecture i386). Not a bash problem.'
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
