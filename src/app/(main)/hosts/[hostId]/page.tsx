import { and, count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RealtimeDashboardRefresh } from "@/components/realtime-dashboard-refresh";
import { DeleteHostButton } from "@/components/delete-host-button";
import { HostRemovalStatus } from "@/components/host-removal-status";
import { DeleteInstanceButton } from "@/components/delete-instance-button";
import { InstancePowerControls } from "@/components/instance-power-controls";
import { HostLinuxRootAccess } from "@/components/host-linux-root-access";
import { HostSteamSettings } from "@/components/host-steam-settings";
import { HostResourcesPanel } from "@/components/host-resources-panel";
import { HostAgentUpdatePanel } from "@/components/host-agent-update-panel";
import { HostBackupPanel } from "@/components/host-backup-panel";
import { HostDetailTabs } from "@/components/host-detail-tabs";
import { HostTerminalPanel } from "@/components/host-terminal-panel";
import { InstanceDeployProgress } from "@/components/instance-deploy-progress";
import { InstanceLogsPanel } from "@/components/instance-logs-panel";
import { RequestRebootButton } from "@/components/request-reboot-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { catalogEntries, hosts, serverInstances } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import {
  effectiveHostStatus,
  isHostHeartbeatFresh,
} from "@/lib/host-presence";
import { isHostDetailTabId } from "@/lib/host-detail-tabs";
import { instanceDashboardStatusLabel } from "@/lib/instance-status-label";
import { cn } from "@/lib/utils";

const PLATFORM_LABEL: Record<string, string> = {
  linux: "Linux",
  macos: "macOS",
  windows: "Windows (WSL)",
};

export default async function HostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ hostId: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const { hostId } = await params;
  const sp = (await searchParams) ?? {};
  const defaultTab =
    typeof sp.tab === "string" && isHostDetailTabId(sp.tab)
      ? sp.tab
      : "overview";

  const rows = await db
    .select()
    .from(hosts)
    .where(eq(hosts.id, hostId))
    .limit(1);

  const host = rows[0];
  if (!host || host.userId !== user.id) {
    notFound();
  }

  const [{ instanceCount }] = await db
    .select({ instanceCount: count() })
    .from(serverInstances)
    .where(eq(serverInstances.hostId, hostId));

  const [{ instancesPendingDelete }] = await db
    .select({ instancesPendingDelete: count() })
    .from(serverInstances)
    .where(
      and(
        eq(serverInstances.hostId, hostId),
        eq(serverInstances.status, "pending_delete")
      )
    );

  const displayHostStatus = effectiveHostStatus({
    status: host.status,
    lastSeenAt: host.lastSeenAt,
  });
  const hostReachable = isHostHeartbeatFresh(host.lastSeenAt);

  const recentInstances = await db
    .select({
      id: serverInstances.id,
      name: serverInstances.name,
      status: serverInstances.status,
      updatedAt: serverInstances.updatedAt,
      provisionMessage: serverInstances.provisionMessage,
      lastError: serverInstances.lastError,
      allocatedPorts: serverInstances.allocatedPorts,
      catalogName: catalogEntries.name,
    })
    .from(serverInstances)
    .leftJoin(
      catalogEntries,
      eq(serverInstances.catalogEntryId, catalogEntries.id)
    )
    .where(eq(serverInstances.hostId, hostId))
    .orderBy(desc(serverInstances.updatedAt))
    .limit(10);

  return (
    <>
      <RealtimeDashboardRefresh />
      <PageHeader
        title={host.name}
        description={
          <span>
            Metrics, instances, backups, and tools are grouped in tabs below.{" "}
            <Link className="text-primary underline" href="/docs/management">
              Host management guide
            </Link>
          </span>
        }
        actions={
          <>
            {host.status === "online" || host.status === "offline" ? (
              <RequestRebootButton hostId={host.id} />
            ) : null}
            <DeleteHostButton
              hostId={host.id}
              hostName={host.name}
              status={host.status}
            />
            <Link
              href="/hosts"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              ← All hosts
            </Link>
          </>
        }
      />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        {host.status === "pending_removal" ? (
          <HostRemovalStatus
            hostId={host.id}
            initialStatus={host.status}
            instancesPendingDelete={instancesPendingDelete}
            instanceTotal={instanceCount}
          />
        ) : null}

        <HostDetailTabs
          defaultTab={defaultTab}
          overview={
            <div className="space-y-6">
              {host.status !== "pending" ? (
                <HostResourcesPanel
                  metrics={host.hostMetrics}
                  lastSeenAt={host.lastSeenAt}
                />
              ) : (
                <Card className="border-dashed border-amber-500/40 bg-amber-500/[0.06]">
                  <CardHeader>
                    <CardTitle className="text-base">Enrollment pending</CardTitle>
                    <CardDescription>
                      Run the install command from <strong>Add host</strong>. Metrics
                      will appear here after the agent connects.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}

              <Card className="border-border/80">
                <CardHeader>
                  <CardTitle className="text-base">Connection</CardTitle>
                  <CardDescription>Enrollment and identity</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">State</span>
                    <Badge variant="secondary">{displayHostStatus}</Badge>
                  </div>
                  {host.platformOs ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Platform</span>
                      <span>
                        {PLATFORM_LABEL[host.platformOs] ?? host.platformOs}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Host ID</span>
                    <code className="max-w-[60%] truncate text-xs">{host.id}</code>
                  </div>
                  {host.agentVersion ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Agent</span>
                      <span className="font-mono text-xs">{host.agentVersion}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No agent version reported yet.
                    </p>
                  )}
                  {host.lastSeenAt ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Last heartbeat</span>
                      <span>
                        {host.lastSeenAt.toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No heartbeat yet.</p>
                  )}
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Live updates use a browser connection to the dashboard; when the agent is
                    connected, changes usually appear within a few seconds. If “Last heartbeat”
                    never changes after the first line, the agent is not reaching the
                    API — check{" "}
                    <code className="rounded bg-muted px-1">~/.steamline/agent.log</code>{" "}
                    on the host and that{" "}
                    <code className="rounded bg-muted px-1">APP_PUBLIC_URL</code> is
                    reachable from that machine.
                  </p>
                  <HostAgentUpdatePanel
                    hostId={host.id}
                    platformOs={host.platformOs}
                    agentReachable={hostReachable}
                  />
                  <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <span className="text-muted-foreground">Created</span>
                    <span>
                      {host.createdAt.toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          }
          servers={
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="text-base">Game servers</CardTitle>
                <CardDescription>
                  Instances on this host ({instanceCount} total). The agent moves
                  them <span className="text-foreground">Queued</span> →{" "}
                  <span className="text-foreground">Installing</span> →{" "}
                  <span className="text-foreground">Install complete</span> (or{" "}
                  <span className="text-foreground">Deployed &amp; running</span>{" "}
                  if a start command was configured on the host).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {recentInstances.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No server instances yet.{" "}
                    <Link href="/servers" className="text-primary underline">
                      Create one in Servers
                    </Link>
                    .
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {recentInstances.map((inst) => (
                      <li
                        key={inst.id}
                        className="rounded-md border border-border/60 px-3 py-3 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate font-medium">{inst.name}</span>
                              <Badge
                                variant="outline"
                                title={`API status: ${inst.status}`}
                              >
                                {instanceDashboardStatusLabel(
                                  inst.status,
                                  inst.provisionMessage
                                )}
                              </Badge>
                            </div>
                          </div>
                          <DeleteInstanceButton
                            instanceId={inst.id}
                            instanceName={inst.name}
                            status={inst.status}
                            className="shrink-0"
                          />
                        </div>
                        <div className="mt-2">
                          <InstancePowerControls
                            instanceId={inst.id}
                            instanceName={inst.name}
                            status={inst.status}
                            hostReachable={hostReachable}
                            className="pb-2"
                          />
                          <InstanceDeployProgress
                            key={`${inst.id}-${inst.updatedAt.toISOString()}`}
                            instanceId={inst.id}
                            initial={{
                              id: inst.id,
                              name: inst.name,
                              status: inst.status,
                              provisionMessage: inst.provisionMessage,
                              lastError: inst.lastError,
                              updatedAt: inst.updatedAt.toISOString(),
                              catalogName: inst.catalogName,
                              hostName: host.name,
                              hostMetrics: host.hostMetrics,
                              allocatedPorts: inst.allocatedPorts,
                              hostReachable,
                            }}
                          />
                          <InstanceLogsPanel instanceId={inst.id} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          }
          backups={
            <HostBackupPanel hostId={host.id} hostReachable={hostReachable} />
          }
          tools={
            <div className="space-y-6">
              <HostTerminalPanel
                hostId={host.id}
                platformOs={host.platformOs ?? null}
                hostReachable={hostReachable}
              />

              <HostLinuxRootAccess hostId={host.id} platformOs={host.platformOs} />

              <Card className="border-border/80">
                <CardHeader>
                  <CardTitle className="text-base">Steam licensed installs</CardTitle>
                  <CardDescription>
                    Games such as Counter-Strike 2 need your Steam account for the
                    download step. Enter your details here once — the enrolled agent
                    pulls them automatically and writes its local env file. You do not
                    need to SSH in or run installer commands for this.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <HostSteamSettings
                    hostId={host.id}
                    hostStatus={host.status}
                    initialSteamUsername={host.steamUsername ?? null}
                  />
                </CardContent>
              </Card>
            </div>
          }
        />
      </div>
    </>
  );
}
