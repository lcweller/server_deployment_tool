import Link from "next/link";
import { desc, eq } from "drizzle-orm";

import { CreateInstanceForm } from "@/app/(main)/servers/create-instance-form";
import { DashboardPoller } from "@/components/dashboard-poller";
import { DeleteInstanceButton } from "@/components/delete-instance-button";
import { InstanceDeployProgress } from "@/components/instance-deploy-progress";
import { InstanceLogsPanel } from "@/components/instance-logs-panel";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { catalogEntries, hosts, serverInstances } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { instanceDashboardStatusLabel } from "@/lib/instance-status-label";
import { cn } from "@/lib/utils";
import { Cpu, Gamepad2, Server } from "lucide-react";

export default async function ServersPage({
  searchParams,
}: {
  searchParams?: Promise<{ catalog?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const sp = (await searchParams) ?? {};
  const defaultCatalogId =
    sp.catalog && /^[0-9a-f-]{36}$/i.test(sp.catalog) ? sp.catalog : undefined;

  const [instanceRows, hostRows, catalogRows] = await Promise.all([
    db
      .select({
        id: serverInstances.id,
        name: serverInstances.name,
        status: serverInstances.status,
        updatedAt: serverInstances.updatedAt,
        catalogName: catalogEntries.name,
        hostName: hosts.name,
        hostMetrics: hosts.hostMetrics,
        provisionMessage: serverInstances.provisionMessage,
        lastError: serverInstances.lastError,
        allocatedPorts: serverInstances.allocatedPorts,
      })
      .from(serverInstances)
      .leftJoin(
        catalogEntries,
        eq(serverInstances.catalogEntryId, catalogEntries.id)
      )
      .leftJoin(hosts, eq(serverInstances.hostId, hosts.id))
      .where(eq(serverInstances.userId, user.id))
      .orderBy(desc(serverInstances.updatedAt)),
    db
      .select({
        id: hosts.id,
        name: hosts.name,
        status: hosts.status,
      })
      .from(hosts)
      .where(eq(hosts.userId, user.id))
      .orderBy(desc(hosts.createdAt)),
    db
      .select({
        id: catalogEntries.id,
        name: catalogEntries.name,
        slug: catalogEntries.slug,
        steamAppId: catalogEntries.steamAppId,
      })
      .from(catalogEntries)
      .orderBy(desc(catalogEntries.popularityScore)),
  ]);

  const enrolledHosts = hostRows.filter((h) => h.status !== "pending");
  const canCreate = enrolledHosts.length > 0 && catalogRows.length > 0;

  return (
    <>
      <DashboardPoller intervalMs={8000} />
      <PageHeader
        title="Servers"
        description="Deploy from the catalog to an enrolled host: we pick non-conflicting game/query ports per machine, verify them on the host when possible, and show what’s left for you (router, firewall, public IP) under each server."
      />
      <div className="flex flex-1 flex-col gap-8 p-4 md:p-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <Card
            className={cn(
              "border-border/80",
              enrolledHosts.length > 0 && "border-primary/25 bg-primary/[0.03]"
            )}
          >
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                <Cpu className="size-4 text-muted-foreground" aria-hidden />
              </span>
              <div>
                <CardTitle className="text-sm font-medium">Hosts ready</CardTitle>
                <CardDescription className="text-xs">
                  Enrolled & online
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {enrolledHosts.length}
              </p>
              <Link
                href="/hosts"
                className="mt-2 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                Manage hosts
              </Link>
            </CardContent>
          </Card>
          <Card
            className={cn(
              "border-border/80",
              catalogRows.length > 0 && "border-primary/25 bg-primary/[0.03]"
            )}
          >
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                <Gamepad2 className="size-4 text-muted-foreground" aria-hidden />
              </span>
              <div>
                <CardTitle className="text-sm font-medium">Catalog titles</CardTitle>
                <CardDescription className="text-xs">
                  Games you can deploy
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {catalogRows.length}
              </p>
              <Link
                href="/catalog"
                className="mt-2 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                Browse catalog
              </Link>
            </CardContent>
          </Card>
          <Card className="border-border/80">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                <Server className="size-4 text-muted-foreground" aria-hidden />
              </span>
              <div>
                <CardTitle className="text-sm font-medium">Your servers</CardTitle>
                <CardDescription className="text-xs">Instances</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {instanceRows.length}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Queued → installing → install complete (or deployed &amp; running)
              </p>
            </CardContent>
          </Card>
        </section>

        {!canCreate ? (
          <Card className="border-dashed border-primary/30 bg-primary/[0.04]">
            <CardHeader>
              <CardTitle className="text-base">Finish one-touch setup</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                You need at least one{" "}
                <strong className="text-foreground">enrolled host</strong> and one{" "}
                <strong className="text-foreground">catalog title</strong>. After
                installing the agent, the control plane seeds starter catalog
                entries on deploy — refresh if you just updated. Then create a
                server below.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Link
                href="/hosts"
                className="inline-flex h-8 items-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted/50"
              >
                Open hosts
              </Link>
              <Link
                href="/catalog"
                className="inline-flex h-8 items-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted/50"
              >
                Open catalog
              </Link>
            </CardContent>
          </Card>
        ) : null}

        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Deploy a server</h2>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Pick a name, host, and game. The agent run loop on the host picks up{" "}
              <span className="text-foreground">queued</span> work and runs SteamCMD
              unless you use{" "}
              <code className="rounded bg-muted px-1">STEAMLINE_PROVISION_STUB=1</code>{" "}
              for dry runs.
            </p>
          </div>
          <CreateInstanceForm
            hosts={hostRows}
            catalog={catalogRows}
            defaultCatalogId={defaultCatalogId}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Your servers</h2>
          {instanceRows.length === 0 ? (
            <Card className="border-border/80 border-dashed">
              <CardHeader>
                <CardTitle className="text-base">No servers yet</CardTitle>
                <CardDescription>
                  Use the form above, or open the{" "}
                  <Link href="/catalog" className="text-primary underline">
                    catalog
                  </Link>{" "}
                  and click <span className="font-medium">Deploy</span> on a title.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {instanceRows.map((row) => (
                <li key={row.id}>
                  <Card className="border-border/80">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-base">{row.name}</CardTitle>
                            <Badge
                              variant="secondary"
                              title={`API status: ${row.status}`}
                            >
                              {instanceDashboardStatusLabel(
                                row.status,
                                row.provisionMessage
                              )}
                            </Badge>
                          </div>
                        </div>
                        <DeleteInstanceButton
                          instanceId={row.id}
                          instanceName={row.name}
                          status={row.status}
                          className="shrink-0"
                        />
                      </div>
                      <CardDescription className="text-xs">
                        {row.catalogName ?? "Unknown catalog"} on{" "}
                        {row.hostName ?? "Unknown host"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <InstanceDeployProgress
                        instanceId={row.id}
                        initial={{
                          id: row.id,
                          name: row.name,
                          status: row.status,
                          provisionMessage: row.provisionMessage,
                          lastError: row.lastError,
                          updatedAt: row.updatedAt.toISOString(),
                          catalogName: row.catalogName,
                          hostName: row.hostName,
                          hostMetrics: row.hostMetrics,
                          allocatedPorts: row.allocatedPorts,
                        }}
                      />
                      <InstanceLogsPanel instanceId={row.id} />
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
