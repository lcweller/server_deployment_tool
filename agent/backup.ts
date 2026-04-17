import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { rm, unlink, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import SftpClient from "ssh2-sftp-client";

import { instanceInstallDir } from "./paths";
import { killGameProcessForInstance, removeInstancePidFile } from "./cleanup";

type Send = ((o: Record<string, unknown>) => void) | undefined;
type Destination = {
  id: string;
  kind: "local" | "s3" | "sftp";
  name: string;
  config?: Record<string, unknown>;
};

function emitBackup(
  send: Send,
  runId: string,
  patch: { status?: string; phase?: string; message?: string; archivePath?: string; checksumSha256?: string; sizeBytes?: number }
) {
  send?.({ type: "backup_run_event", runId, ...patch });
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function runTarGz(srcDir: string, outFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-czf", outFile, "-C", srcDir, "."], {
      stdio: "ignore",
    });
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited ${code}`));
    });
    child.once("error", reject);
  });
}

function extractTarGz(archivePath: string, outDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xzf", archivePath, "-C", outDir], { stdio: "ignore" });
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`tar exited ${code}`))));
    child.once("error", reject);
  });
}

function listLocalArchives(baseDir: string, prefix: string): { file: string; mtimeMs: number }[] {
  if (!existsSync(baseDir)) return [];
  return readdirSync(baseDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".tar.gz"))
    .map((f) => ({ file: path.join(baseDir, f), mtimeMs: statSync(path.join(baseDir, f)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function applyLocalRetention(baseDir: string, prefix: string, keepLast?: number, keepDays?: number) {
  const entries = listLocalArchives(baseDir, prefix);
  const now = Date.now();
  const keepLastN = typeof keepLast === "number" && keepLast > 0 ? keepLast : null;
  const keepDaysMs =
    typeof keepDays === "number" && keepDays > 0 ? keepDays * 24 * 60 * 60 * 1000 : null;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const tooOld = keepDaysMs != null ? now - e.mtimeMs > keepDaysMs : false;
    const overCount = keepLastN != null ? i >= keepLastN : false;
    if (tooOld || overCount) {
      await unlink(e.file).catch(() => {});
    }
  }
}

function toBufferStreamBody(body: unknown): Promise<Buffer> {
  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    return (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      return Buffer.concat(chunks.map((c) => Buffer.from(c)));
    })();
  }
  if (body && typeof body === "object" && "transformToByteArray" in (body as Record<string, unknown>)) {
    return (body as { transformToByteArray: () => Promise<Uint8Array> })
      .transformToByteArray()
      .then((b) => Buffer.from(b));
  }
  throw new Error("Unsupported S3 body stream type.");
}

function s3ClientFromConfig(cfg: Record<string, unknown>): S3Client {
  const region = String(cfg.region ?? "us-east-1");
  const endpoint = typeof cfg.endpoint === "string" ? cfg.endpoint : undefined;
  const accessKeyId = String(cfg.accessKeyId ?? "");
  const secretAccessKey = String(cfg.secretAccessKey ?? "");
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Missing S3 credentials.");
  }
  return new S3Client({
    region,
    endpoint,
    forcePathStyle: cfg.forcePathStyle === true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function uploadToS3(localPath: string, key: string, cfg: Record<string, unknown>) {
  const bucket = String(cfg.bucket ?? "");
  if (!bucket) throw new Error("Missing S3 bucket.");
  const client = s3ClientFromConfig(cfg);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(localPath),
      ContentType: "application/gzip",
    })
  );
}

async function downloadFromS3(localPath: string, key: string, cfg: Record<string, unknown>) {
  const bucket = String(cfg.bucket ?? "");
  if (!bucket) throw new Error("Missing S3 bucket.");
  const client = s3ClientFromConfig(cfg);
  const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!got.Body) throw new Error("S3 object has no body.");
  const buf = await toBufferStreamBody(got.Body);
  await writeFile(localPath, buf);
}

async function applyS3Retention(prefix: string, cfg: Record<string, unknown>, keepLast?: number, keepDays?: number) {
  const bucket = String(cfg.bucket ?? "");
  if (!bucket) throw new Error("Missing S3 bucket.");
  const client = s3ClientFromConfig(cfg);
  const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  const objects = (listed.Contents ?? [])
    .filter((o) => !!o.Key)
    .map((o) => ({ key: o.Key as string, lastModified: o.LastModified?.getTime() ?? 0 }))
    .sort((a, b) => b.lastModified - a.lastModified);
  const now = Date.now();
  const keepLastN = typeof keepLast === "number" && keepLast > 0 ? keepLast : null;
  const keepDaysMs =
    typeof keepDays === "number" && keepDays > 0 ? keepDays * 24 * 60 * 60 * 1000 : null;
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];
    const tooOld = keepDaysMs != null ? now - o.lastModified > keepDaysMs : false;
    const overCount = keepLastN != null ? i >= keepLastN : false;
    if (tooOld || overCount) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: o.key }));
    }
  }
}

async function withSftp<T>(
  cfg: Record<string, unknown>,
  fn: (sftp: SftpClient) => Promise<T>
): Promise<T> {
  const host = String(cfg.host ?? "");
  const username = String(cfg.username ?? "");
  if (!host || !username) throw new Error("Missing SFTP host/username.");
  const sftp = new SftpClient();
  await sftp.connect({
    host,
    port: Number(cfg.port ?? 22),
    username,
    password: typeof cfg.password === "string" ? cfg.password : undefined,
    privateKey: typeof cfg.privateKey === "string" ? cfg.privateKey : undefined,
  });
  try {
    return await fn(sftp);
  } finally {
    await sftp.end().catch(() => {});
  }
}

async function tryRconSaveBeforeBackup(
  send: Send,
  runId: string,
  instanceId: string,
  apiBase: string | undefined,
  bearer: string | undefined
): Promise<void> {
  if (!apiBase || !bearer) {
    return;
  }
  try {
    const url = `${apiBase.replace(/\/$/, "")}/api/v1/agent/instances`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
    if (!res.ok) {
      return;
    }
    const raw = (await res.json()) as { instances?: Array<{ id: string; allocatedPorts?: { rcon?: number } | null }> };
    const inst = raw.instances?.find((i) => i.id === instanceId);
    const rcon = inst?.allocatedPorts?.rcon;
    if (typeof rcon !== "number" || rcon <= 0) {
      return;
    }
    const pw = process.env.STEAMLINE_RCON_PASSWORD?.trim() ?? "";
    emitBackup(send, runId, {
      status: "running",
      phase: "saving",
      message:
        "RCON save attempted (set STEAMLINE_RCON_PASSWORD if your game requires it). Without a password many games skip this step — filesystem backup still runs.",
    });
    const mod = await import("rcon-client");
    const Rcon = mod.Rcon;
    const client = await Rcon.connect({
      host: "127.0.0.1",
      port: rcon,
      password: pw,
    });
    try {
      await client.send("save");
    } catch {
      try {
        await client.send("SaveWorld");
      } catch {
        /* optional */
      }
    }
    await client.end();
  } catch {
    /* optional — many games have no RCON or wrong password */
  }
}

export async function runBackupNow(args: {
  runId: string;
  instanceId: string;
  destination: Destination;
  send: Send;
  apiBase?: string;
  bearer?: string;
}): Promise<void> {
  const { runId, instanceId, destination, send, apiBase, bearer } = args;
  const dir = instanceInstallDir(instanceId);
  if (!existsSync(dir)) {
    emitBackup(send, runId, { status: "failed", phase: "failed", message: "Instance data directory not found." });
    return;
  }
  await tryRconSaveBeforeBackup(send, runId, instanceId, apiBase, bearer);
  const config = destination.config ?? {};
  const baseDirRaw = config.baseDir;
  const baseDir =
    typeof baseDirRaw === "string" && baseDirRaw.trim()
      ? baseDirRaw
      : path.join(process.cwd(), "steamline-backups");
  mkdirSync(baseDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${instanceId}-${stamp}.tar.gz`;
  const archivePath = path.join(baseDir, fileName);
  const remotePrefixRaw = config.prefix;
  const remotePrefix =
    typeof remotePrefixRaw === "string" && remotePrefixRaw.trim()
      ? remotePrefixRaw.replace(/\/+$/, "")
      : `steamline/${instanceId}`;
  const remoteKey = `${remotePrefix}/${fileName}`;
  const keepLast =
    typeof config.keepLast === "number" ? config.keepLast : undefined;
  const keepDays =
    typeof config.keepDays === "number" ? config.keepDays : undefined;
  emitBackup(send, runId, { status: "running", phase: "compressing", message: "Creating compressed backup archive (tar.gz)…" });
  try {
    await runTarGz(dir, archivePath);
    emitBackup(send, runId, { status: "running", phase: "verifying", message: "Calculating SHA-256 checksum..." });
    const checksumSha256 = await sha256File(archivePath);
    const sizeBytes = statSync(archivePath).size;
    if (destination.kind === "s3") {
      emitBackup(send, runId, { status: "running", phase: "uploading", message: "Uploading backup to S3-compatible storage..." });
      await uploadToS3(archivePath, remoteKey, config);
      await applyS3Retention(`${remotePrefix}/`, config, keepLast, keepDays);
    } else if (destination.kind === "sftp") {
      emitBackup(send, runId, { status: "running", phase: "uploading", message: "Uploading backup over SFTP..." });
      await withSftp(config, async (sftp) => {
        const remoteDir = remotePrefix;
        await sftp.mkdir(remoteDir, true).catch(() => {});
        await sftp.put(archivePath, `${remoteDir}/${fileName}`);
        const listing: Array<{ type: string; name: string; modifyTime?: number }> =
          await sftp.list(remoteDir);
        const entries = listing
          .filter((f: { type: string; name: string }) => f.type === "-" && f.name.endsWith(".tar.gz"))
          .map((f: { name: string; modifyTime?: number }) => ({
            name: f.name,
            mtimeMs: Number(f.modifyTime ?? 0),
          }))
          .sort((a: { mtimeMs: number }, b: { mtimeMs: number }) => b.mtimeMs - a.mtimeMs);
        const now = Date.now();
        const keepLastN = typeof keepLast === "number" && keepLast > 0 ? keepLast : null;
        const keepDaysMs =
          typeof keepDays === "number" && keepDays > 0 ? keepDays * 24 * 60 * 60 * 1000 : null;
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          const tooOld = keepDaysMs != null ? now - e.mtimeMs > keepDaysMs : false;
          const overCount = keepLastN != null ? i >= keepLastN : false;
          if (tooOld || overCount) {
            await sftp.delete(`${remoteDir}/${e.name}`).catch(() => {});
          }
        }
      });
    } else {
      await applyLocalRetention(baseDir, `${instanceId}-`, keepLast, keepDays);
    }
    emitBackup(send, runId, {
      status: "done",
      phase: "complete",
      message: "Backup complete.",
      archivePath: destination.kind === "local" ? archivePath : remoteKey,
      checksumSha256,
      sizeBytes,
    });
  } catch (e) {
    emitBackup(send, runId, {
      status: "failed",
      phase: "failed",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function runRestoreNow(args: {
  runId: string;
  instanceId: string;
  destination: Destination;
  backupPath: string;
  send: Send;
}): Promise<void> {
  const { runId, instanceId, destination, backupPath, send } = args;
  const config = destination.config ?? {};
  const localDownload = path.join(
    path.join(process.cwd(), "steamline-backups"),
    `restore-${instanceId}-${Date.now()}.tar.gz`
  );
  mkdirSync(path.dirname(localDownload), { recursive: true });
  emitBackup(send, runId, { status: "running", phase: "downloading", message: "Fetching backup archive..." });
  try {
    if (destination.kind === "local") {
      if (!existsSync(backupPath)) {
        emitBackup(send, runId, { status: "failed", phase: "failed", message: "Backup file not found." });
        return;
      }
    } else if (destination.kind === "s3") {
      await downloadFromS3(localDownload, backupPath, config);
    } else {
      await withSftp(config, async (sftp) => {
        await sftp.fastGet(backupPath, localDownload);
      });
    }
  } catch (e) {
    emitBackup(send, runId, {
      status: "failed",
      phase: "failed",
      message: `Download failed: ${e instanceof Error ? e.message : String(e)}`,
    });
    return;
  }
  const archiveToUse = destination.kind === "local" ? backupPath : localDownload;
  const dir = instanceInstallDir(instanceId);
  mkdirSync(dir, { recursive: true });
  const preRestore = `${dir}.pre-restore-${Date.now()}.tar.gz`;
  emitBackup(send, runId, { status: "running", phase: "stopping", message: "Stopping game server before restore..." });
  killGameProcessForInstance(instanceId);
  removeInstancePidFile(instanceId);
  emitBackup(send, runId, { status: "running", phase: "snapshot", message: "Creating pre-restore snapshot..." });
  try {
    await runTarGz(dir, preRestore);
  } catch {
    /* best effort */
  }
  emitBackup(send, runId, { status: "running", phase: "restoring", message: "Extracting backup archive..." });
  try {
    await rm(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    await extractTarGz(archiveToUse, dir);
    const checksumSha256 = await sha256File(archiveToUse);
    emitBackup(send, runId, {
      status: "done",
      phase: "complete",
      message: "Restore complete. Start the server from dashboard.",
      archivePath: backupPath,
      checksumSha256,
    });
  } catch (e) {
    // Best-effort rollback to pre-restore snapshot.
    try {
      await rm(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      if (existsSync(preRestore)) {
        await new Promise<void>((resolve, reject) => {
          const child = spawn("tar", ["-xzf", preRestore, "-C", dir], { stdio: "ignore" });
          child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`tar exited ${code}`))));
          child.once("error", reject);
        });
      }
    } catch {
      /* ignore */
    }
    emitBackup(send, runId, {
      status: "failed",
      phase: "failed",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function deleteBackupArtifact(
  destination: Destination,
  archivePath: string
): Promise<void> {
  const cfg = destination.config ?? {};
  if (destination.kind === "local") {
    await rm(archivePath, { force: true }).catch(() => {});
    return;
  }
  if (destination.kind === "s3") {
    const bucket = String(cfg.bucket ?? "");
    if (!bucket) {
      throw new Error("Missing S3 bucket.");
    }
    const client = s3ClientFromConfig(cfg);
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: archivePath })
    );
    return;
  }
  await withSftp(cfg, async (sftp) => {
    await sftp.delete(archivePath);
  });
}

export async function testBackupDestination(args: {
  destination: Destination;
  send: Send;
}): Promise<{ ok: boolean; message: string }> {
  const { destination } = args;
  const cfg = destination.config ?? {};
  try {
    if (destination.kind === "local") {
      const baseDirRaw = cfg.baseDir;
      const baseDir =
        typeof baseDirRaw === "string" && baseDirRaw.trim()
          ? baseDirRaw
          : path.join(process.cwd(), "steamline-backups");
      mkdirSync(baseDir, { recursive: true });
      return { ok: true, message: `Local backup directory writable: ${baseDir}` };
    }
    if (destination.kind === "s3") {
      const bucket = String(cfg.bucket ?? "");
      if (!bucket) throw new Error("Missing S3 bucket.");
      const client = s3ClientFromConfig(cfg);
      await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
      return { ok: true, message: `S3 connection OK for bucket ${bucket}.` };
    }
    await withSftp(cfg, async (sftp) => {
      const remoteDir =
        typeof cfg.prefix === "string" && cfg.prefix.trim() ? cfg.prefix : ".";
      await sftp.list(remoteDir);
    });
    return { ok: true, message: "SFTP connection OK." };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

