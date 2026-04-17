/**
 * Remote provisioning: real SteamCMD by default; stub only if STEAMLINE_PROVISION_STUB=1.
 */
import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as net from "node:net";

import { guessAutoLaunchPlan, type AutoLaunchPlan } from "./auto-launch";
import {
  collectSteamCmdDiagnostics,
  ensureSteamCmd,
  type SteamCmdLaunch,
} from "./steamcmd-bootstrap";
import { instanceInstallDir } from "./paths";
import { formatPortEnv, resolvePortsWithLocalProbe } from "./port-probe";
import { writeSteamlinePid } from "./pidfile";
import { applyLinuxFirewallForPorts } from "./linux-firewall";
import { tryUpnpPortForward } from "./upnp-portmap";
import {
  launchPresetFor,
  resolvePresetShellCommand,
} from "./launch-presets";
import {
  resolveSteamCmdLoginPlan,
  type SteamCmdLoginPlan,
} from "./steam-auth";
import { applyWindowsFirewallForPorts } from "./windows-firewall";
import {
  killGameProcessForInstance,
  removeInstancePidFile,
  tearDownNetworkingForInstance,
} from "./cleanup";
import { resetWatchdogState } from "./watchdog-state";
import {
  applyLogSelfHealFromLines,
  quickInstallDirRemediations,
} from "./log-self-heal";

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
/** Return true if pushed on WebSocket; false to fall back to REST (e.g. reconnecting). */
let wsUpstream:
  | ((o: {
      type: "instance_status" | "instance_logs";
      instanceId: string;
      body?: Record<string, unknown>;
      lines?: string[];
    }) => boolean)
  | null = null;

export function setInstanceRealtimeUpstream(
  fn:
    | ((o: {
        type: "instance_status" | "instance_logs";
        instanceId: string;
        body?: Record<string, unknown>;
        lines?: string[];
      }) => boolean)
    | null
): void {
  wsUpstream = fn;
}

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

export async function postInstanceStatus(
  apiBase: string,
  bearer: string,
  instanceId: string,
  body: Record<string, unknown>
): Promise<void> {
  if (wsUpstream) {
    const sent = wsUpstream({ type: "instance_status", instanceId, body });
    if (sent) {
      return;
    }
  }
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

export async function postInstanceLogs(
  apiBase: string,
  bearer: string,
  instanceId: string,
  lines: string[]
): Promise<void> {
  if (wsUpstream) {
    const sent = wsUpstream({ type: "instance_logs", instanceId, lines });
    if (sent) {
      return;
    }
  }
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
export async function postLogLines(
  apiBase: string,
  bearer: string,
  instanceId: string,
  lines: string[]
): Promise<void> {
  for (let i = 0; i < lines.length; i += LOG_CHUNK) {
    await postInstanceLogs(apiBase, bearer, instanceId, lines.slice(i, i + LOG_CHUNK));
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

type StartPlan =
  | { source: "env" | "catalog" | "preset"; kind: "shell"; cmd: string }
  | { source: "auto"; plan: AutoLaunchPlan };

function waitForTcpListening(
  port: number,
  timeoutMs: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, "127.0.0.1");
  });
}

/**
 * Host env → catalog `afterInstallCmd` → built-in Steam App ID preset →
 * auto-detect binary under install dir.
 */
function resolveStartPlan(inst: RemoteInstance, installDir: string): StartPlan | null {
  const envCmd = process.env.STEAMLINE_AFTER_INSTALL_CMD?.trim();
  if (envCmd) {
    return { source: "env", kind: "shell", cmd: envCmd };
  }
  const raw = inst.template?.afterInstallCmd;
  if (typeof raw === "string" && raw.trim()) {
    return { source: "catalog", kind: "shell", cmd: raw.trim() };
  }
  const preset = launchPresetFor(inst.steamAppId);
  const presetCmd =
    preset != null ? resolvePresetShellCommand(preset) : undefined;
  if (presetCmd) {
    return { source: "preset", kind: "shell", cmd: presetCmd };
  }
  const auto = guessAutoLaunchPlan(installDir);
  if (auto) {
    return { source: "auto", plan: auto };
  }
  return null;
}

/** Preset `defaultLaunchArgs` then catalog `defaultLaunchArgs` (for auto / preset shell). */
function mergedExtraArgsForAuto(
  inst: RemoteInstance,
  portEnv: NodeJS.ProcessEnv
): string[] {
  const preset = launchPresetFor(inst.steamAppId);
  const chunks: string[] = [];
  if (typeof preset?.defaultLaunchArgs === "string" && preset.defaultLaunchArgs.trim()) {
    chunks.push(expandEnvPlaceholders(preset.defaultLaunchArgs.trim(), portEnv));
  }
  if (
    typeof inst.template?.defaultLaunchArgs === "string" &&
    inst.template.defaultLaunchArgs.trim()
  ) {
    chunks.push(
      expandEnvPlaceholders(inst.template.defaultLaunchArgs.trim(), portEnv)
    );
  }
  return chunks.join(" ").split(/\s+/).filter(Boolean);
}

/** Catalog-only extra args when catalog supplies full `afterInstallCmd`. */
function extraArgsForCatalogShell(
  inst: RemoteInstance,
  portEnv: NodeJS.ProcessEnv
): string[] {
  const raw = inst.template?.defaultLaunchArgs;
  if (typeof raw !== "string" || !raw.trim()) {
    return [];
  }
  return expandEnvPlaceholders(raw.trim(), portEnv)
    .split(/\s+/)
    .filter(Boolean);
}

function shellAppendArgs(
  plan: StartPlan,
  inst: RemoteInstance,
  portEnv: NodeJS.ProcessEnv
): string[] {
  if (plan.source === "env") {
    return [];
  }
  if (plan.source === "catalog") {
    return extraArgsForCatalogShell(inst, portEnv);
  }
  if (plan.source === "preset") {
    return mergedExtraArgsForAuto(inst, portEnv);
  }
  return [];
}

function spawnStartPlan(
  inst: RemoteInstance,
  plan: StartPlan,
  portEnv: NodeJS.ProcessEnv,
  installDir: string
): ChildProcess {
  const extrasAuto = mergedExtraArgsForAuto(inst, portEnv);

  if (plan.source !== "auto") {
    const base = expandEnvPlaceholders(plan.cmd, portEnv);
    const append = shellAppendArgs(plan, inst, portEnv);
    const cmd =
      append.length > 0 ? `${base} ${append.join(" ")}` : base;
    return spawn(cmd, [], {
      cwd: installDir,
      shell: true,
      detached: true,
      stdio: "ignore",
      env: portEnv,
    });
  }
  const p = plan.plan;
  if (p.kind === "shell") {
    const base = expandEnvPlaceholders(p.cmd, portEnv);
    const cmd =
      extrasAuto.length > 0 ? `${base} ${extrasAuto.join(" ")}` : base;
    return spawn(cmd, [], {
      cwd: p.cwd,
      shell: true,
      detached: true,
      stdio: "ignore",
      env: portEnv,
    });
  }
  return spawn(p.file, [...p.args, ...extrasAuto], {
    cwd: p.cwd,
    shell: false,
    detached: true,
    stdio: "ignore",
    env: portEnv,
  });
}

function instanceDataDir(instanceId: string): string {
  const root = instanceInstallDir(instanceId);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

const DEFAULT_PATH =
  "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

function steamCmdArgsForUpdate(
  installDir: string,
  appId: string,
  login: SteamCmdLoginPlan
): string[] {
  const steamArgs: string[] = ["+force_install_dir", installDir];
  if (login.kind === "steam" && login.guard) {
    steamArgs.push("+set_steam_guard_code", login.guard);
  }
  if (login.kind === "steam") {
    steamArgs.push("+login", login.user, login.pass);
  } else {
    steamArgs.push("+login", "anonymous");
  }
  steamArgs.push("+app_update", appId, "validate", "+quit");
  return steamArgs;
}

type InstallLogStream = {
  apiBase: string;
  bearer: string;
  instanceId: string;
};

/** Throttle for pushing SteamCMD lines to the control plane during app_update (SSE polls ~1s). */
const INSTALL_LOG_FLUSH_MS_DEFAULT = 1500;
/** Also flush when this many complete lines have accumulated. */
const INSTALL_LOG_LINE_BURST = 40;

function installLogFlushMs(): number {
  const raw = process.env.STEAMLINE_INSTALL_LOG_FLUSH_MS?.trim();
  if (!raw) {
    return INSTALL_LOG_FLUSH_MS_DEFAULT;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 250) {
    return INSTALL_LOG_FLUSH_MS_DEFAULT;
  }
  return Math.min(n, 30_000);
}

async function runSteamCmdWithCapture(
  launch: SteamCmdLaunch,
  appId: string,
  installDir: string,
  login: SteamCmdLoginPlan,
  streamLogs?: InstallLogStream
): Promise<{ code: number; allLines: string[] }> {
  if (login.kind === "missing_creds") {
    throw new Error("runSteamCmdWithCapture: missing_creds should be handled before spawn");
  }
  const steamArgs = steamCmdArgsForUpdate(installDir, appId, login);
  const allArgs = [...launch.leadArgs, ...steamArgs];

  return new Promise((resolve, reject) => {
    let carry = "";
    const allLines: string[] = [];
    let lastPostedIdx = 0;
    let lastFlushAt = Date.now();
    const flushMs = streamLogs ? installLogFlushMs() : 0;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let flushChain: Promise<void> = Promise.resolve();

    const flushNow = async (force: boolean) => {
      if (!streamLogs) {
        return;
      }
      const pending = allLines.length - lastPostedIdx;
      if (pending < 1) {
        return;
      }
      const elapsed = Date.now() - lastFlushAt;
      if (
        !force &&
        pending < INSTALL_LOG_LINE_BURST &&
        elapsed < flushMs
      ) {
        return;
      }
      const slice = allLines.slice(lastPostedIdx);
      lastPostedIdx = allLines.length;
      lastFlushAt = Date.now();
      try {
        await postLogLines(
          streamLogs.apiBase,
          streamLogs.bearer,
          streamLogs.instanceId,
          slice
        );
      } catch (e) {
        console.error("[steamline] streaming install logs to API failed:", e);
      }
    };

    const enqueueFlush = (force: boolean) => {
      if (!streamLogs) {
        return;
      }
      flushChain = flushChain
        .then(() => flushNow(force))
        .catch(() => {});
    };

    const appendChunk = (chunk: string) => {
      const full = carry + chunk;
      const parts = full.split("\n");
      carry = parts.pop() ?? "";
      for (const p of parts) {
        allLines.push(p.trimEnd());
      }
      if (
        streamLogs &&
        allLines.length - lastPostedIdx >= INSTALL_LOG_LINE_BURST
      ) {
        enqueueFlush(true);
      }
    };

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

    if (streamLogs) {
      intervalId = setInterval(() => enqueueFlush(false), flushMs);
    }

    child.stdout?.on("data", (d: Buffer) => {
      appendChunk(d.toString("utf8"));
    });
    child.stderr?.on("data", (d: Buffer) => {
      appendChunk(d.toString("utf8"));
    });

    child.on("error", (err) => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      reject(err);
    });

    child.on("close", (code) => {
      if (carry.length) {
        allLines.push(carry.trimEnd());
        carry = "";
      }

      const finish = async () => {
        if (intervalId) {
          clearInterval(intervalId);
        }
        if (streamLogs) {
          await flushChain;
          await flushNow(true);
        }
        resolve({ code: code ?? 1, allLines });
      };

      void finish().catch(reject);
    });
  });
}

type ResolvedPorts = NonNullable<RemoteInstance["allocatedPorts"]>;

/**
 * After game files exist: bind probe, open host firewall + UPnP, spawn dedicated (shared by
 * first-time provision and dashboard **Start**).
 */
export async function runDedicatedLaunchPhase(
  apiBase: string,
  bearer: string,
  inst: RemoteInstance,
  dir: string,
  mode: "fresh_install" | "restart_from_stopped"
): Promise<{ dedicatedStarted: boolean; resolvedPorts: ResolvedPorts | null }> {
  if (mode === "restart_from_stopped") {
    await postLogLines(apiBase, bearer, inst.id, [
      "[steamline] Starting game server again from existing install (no SteamCMD download).",
    ]);
  }

  const quickHeal = quickInstallDirRemediations(dir);
  if (quickHeal.length > 0) {
    await postLogLines(apiBase, bearer, inst.id, quickHeal);
  }

  let resolvedPorts = inst.allocatedPorts ?? null;
  try {
    const probe = await resolvePortsWithLocalProbe(
      inst.allocatedPorts ?? undefined,
      inst.template ?? undefined
    );
    resolvedPorts = probe.ports;
    if (probe.adjusted) {
      await postLogLines(apiBase, bearer, inst.id, [
        `[steamline] Local bind probe chose different ports than the dashboard (another program may be using the original ports): game=${resolvedPorts?.game ?? "—"} query=${resolvedPorts?.query ?? "—"}`,
      ]);
    } else {
      await postLogLines(apiBase, bearer, inst.id, [
        `[steamline] Network ports verified free (TCP+UDP): game=${resolvedPorts?.game ?? "—"} query=${resolvedPorts?.query ?? "—"}`,
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
  const startPlan = resolveStartPlan(inst, dir);
  let dedicatedStarted = false;
  if (startPlan) {
    const srcLabel =
      startPlan.source === "env"
        ? "STEAMLINE_AFTER_INSTALL_CMD"
        : startPlan.source === "catalog"
          ? "catalog template.afterInstallCmd"
          : startPlan.source === "preset"
            ? `built-in Steam App preset (${launchPresetFor(inst.steamAppId)?.label ?? inst.steamAppId ?? "?"})`
            : "auto-detected binary under install tree (heuristic)";
    await postLogLines(apiBase, bearer, inst.id, [
      `[steamline] Starting dedicated process (${srcLabel})…`,
      "[steamline] Environment includes STEAMLINE_GAME_PORT, STEAMLINE_QUERY_PORT, STEAMLINE_INSTALL_DIR, STEAMLINE_PORTS_JSON (and %STEAMLINE_*% expands on Windows cmd).",
    ]);
    if (startPlan.source === "auto") {
      await postLogLines(apiBase, bearer, inst.id, [
        "[steamline] No explicit start command — scanning install folder for a likely server executable (disable with STEAMLINE_DISABLE_AUTO_LAUNCH=1).",
      ]);
    }
    try {
      const child = spawnStartPlan(inst, startPlan, portEnv, dir);
      child.unref();
      if (child.pid != null) {
        dedicatedStarted = true;
        writeSteamlinePid(inst.id, child);
        await postLogLines(apiBase, bearer, inst.id, [
          `[steamline] Wrote steamline.pid for pid ${child.pid} (stop via dashboard Stop or Delete).`,
        ]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await postLogLines(apiBase, bearer, inst.id, [
        `[steamline] Start command failed: ${msg}`,
      ]);
    }
  } else {
    const detail =
      mode === "fresh_install"
        ? "No start path: install produced no recognizable server binary and STEAMLINE_AFTER_INSTALL_CMD, catalog afterInstallCmd, and auto-launch were all empty/disabled."
        : "No start path: STEAMLINE_AFTER_INSTALL_CMD, catalog afterInstallCmd, and auto-launch were all empty/disabled.";
    await postLogLines(apiBase, bearer, inst.id, [`[steamline] ${detail}`]);
  }

  if (dedicatedStarted) {
    if (typeof resolvedPorts?.rcon === "number") {
      const listening = await waitForTcpListening(resolvedPorts.rcon, 2000);
      await postLogLines(apiBase, bearer, inst.id, [
        listening
          ? `[steamline] Listening check passed on tcp/${resolvedPorts.rcon} (RCON).`
          : `[steamline] Listening check did not observe tcp/${resolvedPorts.rcon} within 2s; continuing with running-state policy.`,
      ]);
    }
    const fwLines = applyWindowsFirewallForPorts(inst.id, dir, resolvedPorts ?? {});
    if (fwLines.length > 0) {
      await postLogLines(apiBase, bearer, inst.id, [
        "[steamline] Windows Firewall (best effort — agent may need Administrator):",
        ...fwLines,
      ]);
    }
    const linuxFw = applyLinuxFirewallForPorts(dir, resolvedPorts ?? {});
    if (linuxFw.length > 0) {
      await postLogLines(apiBase, bearer, inst.id, [
        "[steamline] Linux firewall update queued; nftables reconcile loop owns final state.",
        ...linuxFw,
      ]);
    }
    const upnpLogs = await tryUpnpPortForward(inst.id, dir, resolvedPorts ?? {});
    if (upnpLogs.length > 0) {
      await postLogLines(apiBase, bearer, inst.id, [
        "[steamline] Router UPnP (best effort — IGD must be enabled on the router):",
        ...upnpLogs,
      ]);
    }
    resetWatchdogState(inst.id);
  }

  return { dedicatedStarted, resolvedPorts };
}

/**
 * Dashboard **Stop**: kill process, tear down networking, keep files on disk.
 */
export async function processInstanceStop(
  apiBase: string,
  bearer: string,
  inst: RemoteInstance
): Promise<void> {
  if (inst.status !== "stopping") {
    return;
  }
  await postLogLines(apiBase, bearer, inst.id, [
    "[steamline] Stop requested — ending the game process and removing firewall and UPnP mappings for this instance.",
  ]);
  killGameProcessForInstance(inst.id);
  await tearDownNetworkingForInstance(inst.id);
  removeInstancePidFile(inst.id);
  resetWatchdogState(inst.id);
  await postInstanceStatus(apiBase, bearer, inst.id, {
    status: "stopped",
    message:
      "Server stopped on this host. Firewall and router mappings for this server were removed where possible. Game files remain on disk — press Start in the dashboard to run again.",
    ...(inst.allocatedPorts && Object.keys(inst.allocatedPorts).length > 0
      ? { allocatedPorts: inst.allocatedPorts }
      : {}),
  });
}

/**
 * Dashboard **Start** after **Stop**: reuse install dir, re-open networking, spawn dedicated.
 */
export async function processInstanceStart(
  apiBase: string,
  bearer: string,
  inst: RemoteInstance
): Promise<void> {
  if (inst.status !== "starting") {
    return;
  }
  try {
    const dir = instanceDataDir(inst.id);
    const steamApps = path.join(dir, "steamapps");
    if (!fs.existsSync(steamApps)) {
      await postLogLines(apiBase, bearer, inst.id, [
        "[steamline] Cannot start — no Steam library folder under this instance. If you removed files manually, delete this server in the dashboard and create a new one.",
      ]);
      await postInstanceStatus(apiBase, bearer, inst.id, {
        status: "failed",
        message:
          "Start failed: game files are missing from this instance. Remove the server in the dashboard and deploy again.",
      });
      return;
    }

    const { dedicatedStarted, resolvedPorts } = await runDedicatedLaunchPhase(
      apiBase,
      bearer,
      inst,
      dir,
      "restart_from_stopped"
    );

    const statusBody: Record<string, unknown> = {
      status: "running",
      message: dedicatedStarted
        ? `Dedicated command started. Install dir: ${dir}`
        : `Start finished but no dedicated process launched (see logs). Install dir: ${dir}`,
    };
    if (resolvedPorts && Object.keys(resolvedPorts).length > 0) {
      statusBody.allocatedPorts = resolvedPorts;
    }
    await postInstanceStatus(apiBase, bearer, inst.id, statusBody);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await postLogLines(apiBase, bearer, inst.id, [
        `[steamline] Start failed unexpectedly: ${msg}`,
      ]);
    } catch {
      /* ignore */
    }
    try {
      await postInstanceStatus(apiBase, bearer, inst.id, {
        status: "failed",
        message: `Start failed: ${msg}`,
      });
    } catch {
      /* ignore */
    }
  }
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

  await postInstanceStatus(apiBase, bearer, inst.id, {
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
    await postInstanceStatus(apiBase, bearer, inst.id, stubBody);
    return;
  }

  if (!inst.steamAppId) {
    await postInstanceStatus(apiBase, bearer, inst.id, {
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

    const loginPlan = resolveSteamCmdLoginPlan(inst);
    if (loginPlan.kind === "missing_creds") {
      await postLogLines(apiBase, bearer, inst.id, [
        "[steamline] Licensed SteamCMD install requires host credentials.",
        `[steamline] ${loginPlan.reason}`,
      ]);
      await postInstanceStatus(apiBase, bearer, inst.id, {
        status: "failed",
        message: loginPlan.reason,
      });
      return;
    }

    if (loginPlan.kind === "steam") {
      await postLogLines(apiBase, bearer, inst.id, [
        "[steamline] SteamCMD will use STEAMLINE_STEAM_USERNAME (licensed app_update — password is not logged).",
      ]);
    }

    await postLogLines(apiBase, bearer, inst.id, [
      `[steamline] Starting SteamCMD (app_update ${inst.steamAppId}). Install output streams to this log every few seconds — first download can still take many minutes.`,
    ]);

    let steamCmdCode = 1;
    let allLines: string[] = [];
    let steamCmdRetried = false;

    for (;;) {
      const result = await runSteamCmdWithCapture(
        launch,
        inst.steamAppId,
        dir,
        loginPlan,
        { apiBase, bearer, instanceId: inst.id }
      );
      steamCmdCode = result.code;
      allLines = result.allLines;

      const nonEmpty = allLines.filter((l) => l.length > 0);

      if (steamCmdCode === 0) {
        await postLogLines(apiBase, bearer, inst.id, [
          "[steamline] SteamCMD finished successfully (exit 0). Raw lines above were streamed during the run.",
        ]);
        break;
      }

      const body =
        nonEmpty.length > 0
          ? nonEmpty
          : ["(no stdout/stderr captured — check agent process permissions and PATH)"];
      await postLogLines(apiBase, bearer, inst.id, [
        `[steamline] SteamCMD exited with code ${steamCmdCode}. Full output:`,
        ...body,
      ]);
      await postLogLines(apiBase, bearer, inst.id, [
        "[steamline] --- post-failure diagnostics ---",
        ...collectSteamCmdDiagnostics(launch),
      ]);

      const heal = await applyLogSelfHealFromLines(
        nonEmpty.length > 0 ? nonEmpty : allLines,
        "steamcmd",
        {
          apiBase,
          bearer,
          instanceId: inst.id,
          installDir: dir,
          steamcmdDir: launch.steamcmdDir,
          steamAppId: inst.steamAppId,
        }
      );
      if (heal.logLines.length > 0) {
        await postLogLines(apiBase, bearer, inst.id, heal.logLines);
      }

      if (heal.shouldRetrySteamCmd && !steamCmdRetried) {
        steamCmdRetried = true;
        await postLogLines(apiBase, bearer, inst.id, [
          "[steamline] auto-heal: retrying SteamCMD once after host remediation…",
        ]);
        continue;
      }
      break;
    }

    if (steamCmdCode === 0) {
      const { dedicatedStarted, resolvedPorts } = await runDedicatedLaunchPhase(
        apiBase,
        bearer,
        inst,
        dir,
        "fresh_install"
      );
      const statusBody: Record<string, unknown> = {
        status: "running",
        message: dedicatedStarted
          ? `SteamCMD OK; dedicated command started. Install dir: ${dir}`
          : `SteamCMD finished (exit 0). No dedicated process started (no command or auto-launch failed). Install dir: ${dir}`,
      };
      if (resolvedPorts && Object.keys(resolvedPorts).length > 0) {
        statusBody.allocatedPorts = resolvedPorts;
      }
      await postInstanceStatus(apiBase, bearer, inst.id, statusBody);
    } else {
      const hint =
        steamCmdCode === 127
          ? ' If logs show steamcmd.sh + "cannot execute: required file not found" for linux32/steamcmd, the 32-bit ELF loader is missing (usually /lib/ld-linux.so.2). As root: apt-get install -y libc6-i386 (after dpkg --add-architecture i386). Not a bash problem.'
          : "";
      await postInstanceStatus(apiBase, bearer, inst.id, {
        status: "failed",
        message: `SteamCMD exited with code ${steamCmdCode}.${hint} See instance logs below for full SteamCMD output and diagnostics.`,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await postLogLines(apiBase, bearer, inst.id, [`[steamline] error: ${msg}`]);
    await postInstanceStatus(apiBase, bearer, inst.id, {
      status: "failed",
      message: msg,
    });
  }
}
