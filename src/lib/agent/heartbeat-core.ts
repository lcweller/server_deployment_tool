import { and, eq, ne, type InferSelectModel } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import type { HostMetricsSnapshot } from "@/lib/host-metrics";
import { publishHostRealtime } from "@/lib/realtime/host-updates";
import { isHostHeartbeatFresh } from "@/lib/host-presence";
import { recordUserNotification } from "@/lib/user-notifications";
import { hosts, serverInstances } from "@/db/schema";
import {
  decryptLinuxRootPassword,
  encryptLinuxRootPassword,
} from "@/lib/crypto/linux-root-password";
import { decryptSteamHostSecretsPending } from "@/lib/crypto/steam-host-secrets";

const memoryModuleSchema = z.object({
  sizeBytes: z.number().nonnegative().nullable().optional(),
  manufacturer: z.string().max(128).nullable().optional(),
  partNumber: z.string().max(128).nullable().optional(),
  speedMtS: z.number().int().min(0).max(1e6).nullable().optional(),
  locator: z.string().max(128).nullable().optional(),
});

const diskMountSchema = z.object({
  mountPoint: z.string().max(512),
  fstype: z.string().max(64).nullable().optional(),
  device: z.string().max(512).nullable().optional(),
  totalBytes: z.number().nonnegative(),
  usedBytes: z.number().nonnegative(),
  freeBytes: z.number().nonnegative(),
  usedPercent: z.number().min(0).max(100),
  model: z.string().max(256).nullable().optional(),
  readBps: z.number().min(0).nullable().optional(),
  writeBps: z.number().min(0).nullable().optional(),
});

const netIfaceSchema = z.object({
  name: z.string().max(64),
  mac: z.string().max(32).nullable().optional(),
  ipv4: z.array(z.string().max(45)).max(16).optional(),
  ipv6: z.array(z.string().max(64)).max(32).optional(),
  linkSpeedMbps: z.number().int().min(-1).max(1_000_000).nullable().optional(),
  rxBps: z.number().min(0).nullable().optional(),
  txBps: z.number().min(0).nullable().optional(),
});

const gpuSchema = z.object({
  vendor: z.enum(["nvidia", "amd", "intel", "unknown"]),
  model: z.string().max(256),
  vramBytes: z.number().nonnegative().nullable().optional(),
  tempC: z.number().min(-50).max(200).nullable().optional(),
  utilPercent: z.number().min(0).max(100).nullable().optional(),
});

const environmentSchema = z.object({
  hostingType: z.enum([
    "bare-metal",
    "vm",
    "vps",
    "container",
    "unknown",
  ]),
  hypervisor: z.string().max(128).nullable().optional(),
  provider: z.string().max(128).nullable().optional(),
  virtualizationDetail: z.string().max(512).nullable().optional(),
  systemManufacturer: z.string().max(256).nullable().optional(),
  systemProductName: z.string().max(256).nullable().optional(),
});

const metricsSchema = z.object({
  hostname: z.string().max(256).optional(),
  platform: z.string().max(32).optional(),
  cpuModel: z.string().max(512).optional(),
  cpuCores: z.number().int().min(1).max(4096).optional(),
  cpuPhysicalCores: z.number().int().min(0).max(4096).nullable().optional(),
  cpuSockets: z.number().int().min(1).max(256).nullable().optional(),
  cpuLayoutSummary: z.string().max(512).nullable().optional(),
  cpuModelLines: z.array(z.string().max(512)).max(64).optional(),
  cpuTempCelsius: z.number().min(-50).max(200).nullable().optional(),
  cpuPerCoreUsagePct: z.array(z.number().min(0).max(100)).max(4096).optional(),
  loadAvg1m: z.number().min(0).max(1e6).optional(),
  cpuEstimatePercent: z.number().min(0).max(100).optional(),
  memTotalBytes: z.number().nonnegative().optional(),
  memUsedBytes: z.number().nonnegative().optional(),
  memUsedPercent: z.number().min(0).max(100).optional(),
  memoryModuleCount: z.number().int().min(0).max(256).nullable().optional(),
  memoryModuleSummary: z.string().max(2048).nullable().optional(),
  memoryModules: z.array(memoryModuleSchema).max(64).optional(),
  diskPath: z.string().max(512).optional(),
  diskTotalBytes: z.number().nonnegative().optional(),
  diskUsedBytes: z.number().nonnegative().optional(),
  diskFreeBytes: z.number().nonnegative().optional(),
  diskUsedPercent: z.number().min(0).max(100).optional(),
  diskMounts: z.array(diskMountSchema).max(48).optional(),
  networkInterfaces: z.array(netIfaceSchema).max(64).optional(),
  gpus: z.array(gpuSchema).max(16).optional(),
  environment: environmentSchema.optional(),
  uptimeSeconds: z.number().int().min(0).max(1e10).optional(),
  osPrettyName: z.string().max(512).nullable().optional(),
  osVersionId: z.string().max(128).nullable().optional(),
  kernelVersion: z.string().max(256).optional(),
  publicIpv4: z.string().max(45).nullable().optional(),
});

const osUpdateReportSchema = z.object({
  outcome: z.enum(["applied", "failed", "skipped", "available"]),
  detail: z.string().max(2000).optional(),
});

const bodySchema = z.object({
  agentVersion: z.string().max(64).optional(),
  metrics: metricsSchema.optional(),
  osUpdateReport: osUpdateReportSchema.optional(),
});

const minimalBodySchema = z.object({
  agentVersion: z.string().max(64).optional(),
});

export type AgentHeartbeatResponse = {
  ok: boolean;
  hostId: string;
  promotedInstanceIds: string[];
  pendingReboot: boolean;
  deliverSteamCredentials?: {
    steamUsername: string;
    steamPassword: string;
    steamGuardCode?: string;
  };
  deliverLinuxRootPassword?: { password: string };
};

export type AuthenticatedHost = InferSelectModel<typeof hosts>;

export type OsUpdateReportPayload = z.infer<typeof osUpdateReportSchema>;

export function parseHeartbeatRequestBody(json: unknown): {
  agentVersion?: string;
  metricsSnapshot?: HostMetricsSnapshot;
  osUpdateReport?: OsUpdateReportPayload;
} {
  let agentVersion: string | undefined;
  let metricsSnapshot: HostMetricsSnapshot | undefined;
  let osUpdateReport: OsUpdateReportPayload | undefined;

  const full = bodySchema.safeParse(json);
  if (full.success) {
    agentVersion = full.data.agentVersion;
    osUpdateReport = full.data.osUpdateReport;
    if (full.data.metrics) {
      metricsSnapshot = {
        ...full.data.metrics,
        receivedAt: new Date().toISOString(),
      };
    }
  } else {
    const minimal = minimalBodySchema.safeParse(json);
    if (minimal.success) {
      agentVersion = minimal.data.agentVersion;
    }
  }

  return { agentVersion, metricsSnapshot, osUpdateReport };
}

function maxDiskUsedPercentFromMetrics(m: HostMetricsSnapshot): number {
  let max = typeof m.diskUsedPercent === "number" ? m.diskUsedPercent : 0;
  const mounts = m.diskMounts;
  if (Array.isArray(mounts)) {
    for (const d of mounts) {
      if (typeof d.usedPercent === "number" && d.usedPercent > max) {
        max = d.usedPercent;
      }
    }
  }
  return max;
}

/**
 * Shared by REST `POST /api/v1/agent/heartbeat` and the agent WebSocket channel.
 */
export async function runAgentHeartbeatTransaction(args: {
  host: AuthenticatedHost;
  json?: unknown;
}): Promise<{ response: AgentHeartbeatResponse } | { error: string; status: number }> {
  const { host, json } = args;
  const { agentVersion, metricsSnapshot, osUpdateReport } = parseHeartbeatRequestBody(
    json ?? {}
  );

  const [hostRow] = await db
    .select({
      rebootRequestedAt: hosts.rebootRequestedAt,
      priorLastSeenAt: hosts.lastSeenAt,
    })
    .from(hosts)
    .where(eq(hosts.id, host.id))
    .limit(1);

  const pendingReboot = hostRow?.rebootRequestedAt != null;

  try {
    const heartbeatResult = await db.transaction(async (tx) => {
      const heartbeatFields = {
        lastSeenAt: new Date(),
        ...(agentVersion ? { agentVersion } : {}),
        ...(metricsSnapshot ? { hostMetrics: metricsSnapshot } : {}),
      };

      await tx
        .update(hosts)
        .set({ ...heartbeatFields, status: "online" })
        .where(and(eq(hosts.id, host.id), ne(hosts.status, "pending_removal")));
      await tx
        .update(hosts)
        .set(heartbeatFields)
        .where(and(eq(hosts.id, host.id), eq(hosts.status, "pending_removal")));

      const promoted = await tx
        .update(serverInstances)
        .set({ status: "queued", updatedAt: new Date() })
        .where(
          and(
            eq(serverInstances.hostId, host.id),
            eq(serverInstances.status, "draft")
          )
        )
        .returning({ id: serverInstances.id });

      const [credRow] = await tx
        .select({
          pendingSteam: hosts.steamSecretsPending,
          pendingRoot: hosts.linuxRootPasswordPendingEnc,
        })
        .from(hosts)
        .where(eq(hosts.id, host.id))
        .limit(1);

      let deliverSteamCredentials:
        | {
            steamUsername: string;
            steamPassword: string;
            steamGuardCode?: string;
          }
        | undefined;

      const pending = credRow?.pendingSteam?.trim();
      if (pending) {
        try {
          const picked = decryptSteamHostSecretsPending(pending);
          deliverSteamCredentials = {
            steamUsername: picked.steamUsername,
            steamPassword: picked.steamPassword,
            ...(picked.steamGuardCode
              ? { steamGuardCode: picked.steamGuardCode }
              : {}),
          };
        } catch {
          deliverSteamCredentials = undefined;
        }
        await tx
          .update(hosts)
          .set({ steamSecretsPending: null })
          .where(eq(hosts.id, host.id));
      }

      let deliverLinuxRootPassword: { password: string } | undefined;
      const rootPending = credRow?.pendingRoot?.trim();
      if (rootPending) {
        try {
          const plain = decryptLinuxRootPassword(rootPending);
          deliverLinuxRootPassword = { password: plain };
          await tx
            .update(hosts)
            .set({
              linuxRootPasswordPendingEnc: null,
              linuxRootPasswordEnc: encryptLinuxRootPassword(plain),
            })
            .where(eq(hosts.id, host.id));
        } catch {
          deliverLinuxRootPassword = undefined;
        }
      }

      const res: AgentHeartbeatResponse = {
        ok: true,
        hostId: host.id,
        promotedInstanceIds: promoted.map((r) => r.id),
        pendingReboot,
        ...(deliverSteamCredentials ? { deliverSteamCredentials } : {}),
        ...(deliverLinuxRootPassword ? { deliverLinuxRootPassword } : {}),
      };

      return res;
    });

    publishHostRealtime(host.userId, {
      hostId: host.id,
      kind: metricsSnapshot ? "metrics" : "heartbeat",
    });

    const prior = hostRow?.priorLastSeenAt ?? null;
    if (prior != null && !isHostHeartbeatFresh(prior)) {
      void recordUserNotification({
        userId: host.userId,
        eventType: "host_online",
        severity: "info",
        title: `Host back online: ${host.name}`,
        message: "The agent heartbeat resumed — this host is reachable again.",
        linkHref: `/hosts/${host.id}`,
        hostId: host.id,
      });
    }

    if (metricsSnapshot) {
      const used = maxDiskUsedPercentFromMetrics(metricsSnapshot);
      if (used > 95) {
        void recordUserNotification({
          userId: host.userId,
          eventType: "disk_low_5",
          severity: "critical",
          title: `Disk almost full on ${host.name}`,
          message: `A mount on this host is over 95% full (${used.toFixed(1)}% used). Free space soon to avoid game updates or saves failing.`,
          linkHref: `/hosts/${host.id}`,
          hostId: host.id,
        });
      } else if (used > 90) {
        void recordUserNotification({
          userId: host.userId,
          eventType: "disk_low_10",
          severity: "warning",
          title: `Low disk space on ${host.name}`,
          message: `A mount on this host is over 90% full (${used.toFixed(1)}% used). Consider freeing space or expanding the volume.`,
          linkHref: `/hosts/${host.id}`,
          hostId: host.id,
        });
      }
    }

    if (osUpdateReport) {
      const d = osUpdateReport.detail?.trim();
      const baseMsg = d ?? "";
      if (osUpdateReport.outcome === "available") {
        void recordUserNotification({
          userId: host.userId,
          eventType: "os_update_available",
          severity: "info",
          title: `OS updates available on ${host.name}`,
          message: baseMsg || "Package updates are available for this host’s operating system.",
          linkHref: `/hosts/${host.id}`,
          hostId: host.id,
        });
      } else if (osUpdateReport.outcome === "applied") {
        void recordUserNotification({
          userId: host.userId,
          eventType: "os_update_applied",
          severity: "info",
          title: `OS updates applied on ${host.name}`,
          message: baseMsg || "Operating system packages were updated successfully.",
          linkHref: `/hosts/${host.id}`,
          hostId: host.id,
        });
      } else if (osUpdateReport.outcome === "failed") {
        void recordUserNotification({
          userId: host.userId,
          eventType: "os_update_failed",
          severity: "error",
          title: `OS update failed on ${host.name}`,
          message: baseMsg || "An automatic or scheduled OS package update did not complete successfully.",
          linkHref: `/hosts/${host.id}`,
          hostId: host.id,
        });
      } else if (osUpdateReport.outcome === "skipped") {
        void recordUserNotification({
          userId: host.userId,
          eventType: "os_update_skipped",
          severity: "warning",
          title: `OS update skipped on ${host.name}`,
          message:
            baseMsg ||
            "A pending operating system update was skipped because of a compatibility or safety check.",
          linkHref: `/hosts/${host.id}`,
          hostId: host.id,
        });
      }
    }

    return { response: heartbeatResult };
  } catch {
    return { error: "Heartbeat transaction failed", status: 500 };
  }
}

/**
 * Variant that parses JSON body (REST handler).
 */
export async function runAgentHeartbeatFromJson(
  host: AuthenticatedHost,
  json: unknown
): Promise<{ response: AgentHeartbeatResponse } | { error: string; status: number }> {
  return runAgentHeartbeatTransaction({
    host,
    json,
  } as { host: AuthenticatedHost; json: unknown });
}
