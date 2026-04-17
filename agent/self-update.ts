/**
 * Download and hot-swap the bundled agent (Linux production path).
 * Backs up the previous binary to steamline-agent.cjs.bak before replacing.
 */
import { createHash } from "node:crypto";
import { chmod, copyFile, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import * as path from "node:path";

import { getAgentVersionSemver } from "./agent-version";
import { compareSemver } from "./semver-cmp";
import { shutdownAllTerminalSessions } from "./terminal-manager";
import { steamlineInstallRoot } from "./steamline-install-path";

export type UpdateEventPhase =
  | "checking"
  | "downloading"
  | "verifying"
  | "installing"
  | "restarting"
  | "error"
  | "done"
  | "noop";

function emit(
  send: ((o: Record<string, unknown>) => void) | undefined,
  phase: UpdateEventPhase,
  message?: string
): void {
  send?.({
    type: "agent_update_event",
    phase,
    message,
    at: new Date().toISOString(),
  });
  if (phase === "noop") {
    return;
  }
  if (message) {
    console.error(`[steamline] update: ${phase} — ${message}`);
  } else {
    console.error(`[steamline] update: ${phase}`);
  }
}

function updateEvent(
  phase: UpdateEventPhase,
  message?: string
): Record<string, unknown> {
  return {
    type: "agent_update_event",
    phase,
    message,
    at: new Date().toISOString(),
  };
}

export function buildUpdateEvent(
  phase: UpdateEventPhase,
  message?: string
): Record<string, unknown> {
  return updateEvent(phase, message);
}

async function sha256File(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

async function downloadToFile(url: string, dest: string, bearer: string): Promise<void> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

/**
 * Fetch latest manifest; returns null if fetch fails (caller logs).
 * Uses the same auth as other agent APIs.
 */
export async function fetchLatestManifest(
  baseUrl: string,
  bearer: string
): Promise<{
  version: string;
  downloadUrl: string;
  checksumSha256: string;
  releaseNotes?: string;
  minAgentVersion?: string | null;
  previousVersion?: string;
} | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/agent/updates/latest`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  if (!res.ok) {
    return null;
  }
  const j = (await res.json()) as Record<string, unknown>;
  const version = j.version;
  const downloadUrl = j.downloadUrl;
  const checksumSha256 = j.checksumSha256 ?? j.checksum_sha256;
  const previousVersion = j.previousVersion;
  if (typeof version !== "string" || typeof downloadUrl !== "string" || typeof checksumSha256 !== "string") {
    return null;
  }
  return {
    version,
    downloadUrl,
    checksumSha256,
    releaseNotes: typeof j.releaseNotes === "string" ? j.releaseNotes : undefined,
    minAgentVersion:
      typeof j.minAgentVersion === "string"
        ? j.minAgentVersion
        : j.minAgentVersion === null
          ? null
          : undefined,
    previousVersion: typeof previousVersion === "string" ? previousVersion : undefined,
  };
}

export function isUpdateAvailable(
  currentSemver: string,
  latestSemver: string
): boolean {
  return compareSemver(latestSemver, currentSemver) > 0;
}

/**
 * Apply update: download, verify hash, swap files, spawn new agent, exit this process.
 */
export async function applyAgentSelfUpdate(
  baseUrl: string,
  bearer: string,
  send: ((o: Record<string, unknown>) => void) | undefined,
  opts?: { targetVersion?: string }
): Promise<void> {
  if (process.platform !== "linux") {
    emit(send, "error", "Self-update is only supported on Linux.");
    return;
  }

  const root = steamlineInstallRoot();
  const targetPath = path.join(root, "steamline-agent.cjs");
  let st: Awaited<ReturnType<typeof stat>>;
  try {
    st = await stat(targetPath);
  } catch {
    emit(send, "error", `Agent bundle not found at ${targetPath}`);
    return;
  }
  if (!st.isFile()) {
    emit(send, "error", `${targetPath} is not a file`);
    return;
  }

  emit(send, "checking");
  const manifest = await fetchLatestManifest(baseUrl, bearer);
  if (!manifest) {
    emit(send, "error", "Could not load update manifest (check network and API key).");
    return;
  }

  const current = getAgentVersionSemver();
  const wantVersion = opts?.targetVersion?.trim() || manifest.version;

  if (opts?.targetVersion && compareSemver(wantVersion, manifest.version) !== 0) {
    emit(send, "error", `Requested version ${wantVersion} is not the published latest (${manifest.version}).`);
    return;
  }

  if (manifest.minAgentVersion) {
    if (compareSemver(current, manifest.minAgentVersion) < 0) {
      emit(
        send,
        "error",
        `This agent (${current}) is below minAgentVersion ${manifest.minAgentVersion}; enroll a fresh host or install manually.`
      );
      return;
    }
  }

  if (!isUpdateAvailable(current, wantVersion)) {
    emit(send, "noop", `Already running ${current} (latest ${wantVersion}).`);
    return;
  }

  const downloadUrl = manifest.downloadUrl;
  const tmp = path.join(root, `steamline-agent.cjs.download-${Date.now()}`);
  const bak = path.join(root, "steamline-agent.cjs.bak");

  try {
    emit(send, "downloading", wantVersion);
    await downloadToFile(downloadUrl, tmp, bearer);

    emit(send, "verifying");
    const hash = await sha256File(tmp);
    if (hash !== manifest.checksumSha256) {
      await unlink(tmp).catch(() => {});
      emit(send, "error", `Checksum mismatch (expected ${manifest.checksumSha256}, got ${hash})`);
      return;
    }

    await chmod(tmp, 0o755).catch(() => {});

    emit(send, "installing");
    shutdownAllTerminalSessions();
    try {
      await copyFile(targetPath, bak);
    } catch (e) {
      await unlink(tmp).catch(() => {});
      emit(send, "error", `Could not back up current binary: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    try {
      await rename(tmp, targetPath);
    } catch (e) {
      await unlink(tmp).catch(() => {});
      emit(send, "error", `Could not install new binary: ${e instanceof Error ? e.message : String(e)}`);
      try {
        await copyFile(bak, targetPath);
      } catch {
        /* ignore */
      }
      return;
    }

    emit(send, "restarting");
    const child = spawn(
      process.execPath,
      [targetPath, "run", baseUrl.replace(/\/$/, "")],
      {
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          STEAMLINE_UPDATE_EXPECTED_VERSION: wantVersion,
          STEAMLINE_UPDATE_PREVIOUS_VERSION: current,
          STEAMLINE_UPDATE_BACKUP_PATH: bak,
        },
        cwd: root,
      }
    );
    child.unref();
    if (typeof child.pid !== "number" || child.pid <= 0) {
      try {
        await copyFile(bak, targetPath);
      } catch {
        /* ignore */
      }
      emit(send, "error", "Could not spawn new agent process");
      return;
    }

    emit(send, "done", `Restarting as ${wantVersion}`);
    process.exit(0);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    emit(send, "error", e instanceof Error ? e.message : String(e));
  }
}

export async function runPostUpdateHealthCheck(
  baseUrl: string,
  bearer: string,
  expectedVersion: string,
  isWsConnected: () => boolean,
  send: ((o: Record<string, unknown>) => void) | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  emit(send, "checking", `Post-update health check for ${expectedVersion}...`);
  const running = getAgentVersionSemver();
  if (compareSemver(running, expectedVersion) !== 0) {
    return {
      ok: false,
      error: `Version mismatch after restart (expected ${expectedVersion}, running ${running}).`,
    };
  }

  const hostUrl = `${baseUrl.replace(/\/$/, "")}/api/v1/agent/host`;
  const hostRes = await fetch(hostUrl, {
    headers: { Authorization: `Bearer ${bearer}` },
  }).catch(() => null);
  if (!hostRes?.ok) {
    return { ok: false, error: "Platform API check failed after restart." };
  }
  emit(send, "checking", "API reachability check passed.");

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (isWsConnected()) {
      emit(send, "done", `Update successful — running ${running}.`);
      return { ok: true };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, error: "WebSocket did not reconnect within 30 seconds." };
}

export async function rollbackAgentBinary(
  baseUrl: string,
  reason: string
): Promise<void> {
  const root = steamlineInstallRoot();
  const targetPath = path.join(root, "steamline-agent.cjs");
  const backupPath = process.env.STEAMLINE_UPDATE_BACKUP_PATH?.trim();
  const previousVersion =
    process.env.STEAMLINE_UPDATE_PREVIOUS_VERSION?.trim() || "unknown";
  const failedVersion =
    process.env.STEAMLINE_UPDATE_EXPECTED_VERSION?.trim() || "unknown";
  if (!backupPath) {
    throw new Error(`Rollback failed: missing backup path (${reason})`);
  }
  await copyFile(backupPath, targetPath);
  const child = spawn(process.execPath, [targetPath, "run", baseUrl.replace(/\/$/, "")], {
    detached: true,
    stdio: "ignore",
    cwd: root,
    env: {
      ...process.env,
      STEAMLINE_UPDATE_EXPECTED_VERSION: "",
      STEAMLINE_UPDATE_PREVIOUS_VERSION: "",
      STEAMLINE_UPDATE_BACKUP_PATH: "",
      STEAMLINE_UPDATE_ROLLBACK_REPORT: `Update to ${failedVersion} failed: ${reason}. Rolled back to ${previousVersion}.`,
    },
  });
  child.unref();
}

/** Dashboard "Check for updates" — report status over WebSocket (no install). */
export async function checkAgentUpdateFromControl(
  baseUrl: string,
  bearer: string,
  send: ((o: Record<string, unknown>) => void) | undefined
): Promise<void> {
  emit(send, "checking");
  const manifest = await fetchLatestManifest(baseUrl, bearer);
  if (!manifest) {
    emit(send, "error", "Could not load update manifest.");
    return;
  }
  const current = getAgentVersionSemver();
  if (isUpdateAvailable(current, manifest.version)) {
    emit(
      send,
      "checking",
      `New version ${manifest.version} available (running ${current}).`
    );
  } else {
    emit(send, "noop", `Already on latest (${current}).`);
  }
}

/**
 * Background check: log when an update exists; optionally auto-apply.
 */
export async function maybeCheckForUpdate(
  baseUrl: string,
  bearer: string,
  send: ((o: Record<string, unknown>) => void) | undefined
): Promise<void> {
  if (process.platform !== "linux") {
    return;
  }
  const manifest = await fetchLatestManifest(baseUrl, bearer);
  if (!manifest) {
    return;
  }
  const current = getAgentVersionSemver();
  if (!isUpdateAvailable(current, manifest.version)) {
    return;
  }
  console.error(
    `[steamline] A newer agent is available: ${manifest.version} (running ${current}). Use the dashboard or set STEAMLINE_AGENT_AUTO_UPDATE=1 to apply.`
  );
  emit(
    send,
    "checking",
    `New version ${manifest.version} available (running ${current}).`
  );
  if (process.env.STEAMLINE_AGENT_AUTO_UPDATE === "1") {
    await applyAgentSelfUpdate(baseUrl, bearer, send);
  }
}
