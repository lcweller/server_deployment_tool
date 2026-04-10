import { and, count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardPoller } from "@/components/dashboard-poller";
import { DeleteHostButton } from "@/components/delete-host-button";
import { HostRemovalStatus } from "@/components/host-removal-status";
import { DeleteInstanceButton } from "@/components/delete-instance-button";
import { HostResourcesPanel } from "@/components/host-resources-panel";
import { InstanceDeployProgress } from "@/components/instance-deploy-progress";
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
import { hosts, serverInstances } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const PLATFORM_LABEL: Record<string, string> = {
  linux: "Linux",
  macos: "macOS",
  windows: "Windows (WSL)",
};

export default async function HostDetailPage({
  params,
}: {
  params: Promise<{ hostId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const { hostId } = await params;

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

  const recentInstances = await db
    .select({
      id: serverInstances.id,
      name: serverInstances.name,
      status: serverInstances.status,
      updatedAt: serverInstances.updatedAt,
      provisionMessage: serverInstances.provisionMessage,
      lastError: serverInstances.lastError,
    })
    .from(serverInstances)
    .where(eq(serverInstances.hostId, hostId))
    .orderBy(desc(serverInstances.updatedAt))
    .limit(10);

  return (
    <>
      <DashboardPoller intervalMs={8000} />
      <PageHeader
        title={host.name}
        description="Agent status, live resource usage, and servers on this machine."
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

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="text-base">Connection</CardTitle>
              <CardDescription>Enrollment and identity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">State</span>
                <Badge variant="secondary">{host.status}</Badge>
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
                This page refreshes every ~8s while open. If “Last heartbeat”
                never changes after the first line, the agent is not reaching the
                API — check{" "}
                <code className="rounded bg-muted px-1">~/.steamline/agent.log</code>{" "}
                on the host and that{" "}
                <code className="rounded bg-muted px-1">APP_PUBLIC_URL</code> is
                reachable from that machine.
              </p>
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

          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="text-base">Game servers</CardTitle>
              <CardDescription>
                Instances on this host ({instanceCount} total). The agent moves
                them <span className="text-foreground">queued</span> →{" "}
                <span className="text-foreground">installing</span> →{" "}
                <span className="text-foreground">running</span>.
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
                            <Badge variant="outline">{inst.status}</Badge>
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
                        <InstanceDeployProgress
                          instanceId={inst.id}
                          initial={{
                            id: inst.id,
                            name: inst.name,
                            status: inst.status,
                            provisionMessage: inst.provisionMessage,
                            lastError: inst.lastError,
                            updatedAt: inst.updatedAt.toISOString(),
                            catalogName: null,
                            hostName: null,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
