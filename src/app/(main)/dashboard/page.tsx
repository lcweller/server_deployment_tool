import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { Activity, Bell, Gamepad2, Server } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { db } from "@/db";
import { hosts, serverInstances, userNotifications } from "@/db/schema";
import type { HostMetricsSnapshot } from "@/lib/host-metrics";
import { clampPct } from "@/lib/host-metrics";
import { effectiveHostStatus } from "@/lib/host-presence";
import { formatRelativeTime } from "@/lib/relative-time";
import { getCurrentUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

function primaryIp(metrics: HostMetricsSnapshot | null): string {
  if (!metrics) return "—";
  if (metrics.publicIpv4?.trim()) return metrics.publicIpv4.trim();
  const ni = metrics.networkInterfaces?.find((n) => n.ipv4?.length);
  return ni?.ipv4?.[0] ?? "—";
}

function cpuPct(m: HostMetricsSnapshot | null): number | null {
  if (!m) return null;
  if (m.cpuEstimatePercent != null) return clampPct(m.cpuEstimatePercent);
  const cores = m.cpuPerCoreUsagePct;
  if (cores?.length) {
    const sum = cores.reduce((a, b) => a + b, 0);
    return clampPct(sum / cores.length);
  }
  return null;
}

function diskPct(m: HostMetricsSnapshot | null): number | null {
  if (!m) return null;
  if (m.diskUsedPercent != null) return clampPct(m.diskUsedPercent);
  const first = m.diskMounts?.[0];
  if (first?.usedPercent != null) return clampPct(first.usedPercent);
  return null;
}

function MiniBar({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const pct = value ?? 0;
  const tone =
    pct >= 85 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">
          {value == null ? "—" : `${pct}%`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", tone)}
          style={{ width: `${value == null ? 0 : pct}%` }}
        />
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const [
    hostRows,
    instanceTotalRow,
    instanceRunningRow,
    unreadRow,
    issueRow,
    recentNotes,
    instanceByHost,
  ] = await Promise.all([
    db
      .select({
        id: hosts.id,
        name: hosts.name,
        status: hosts.status,
        lastSeenAt: hosts.lastSeenAt,
        hostMetrics: hosts.hostMetrics,
      })
      .from(hosts)
      .where(eq(hosts.userId, user.id))
      .orderBy(desc(hosts.createdAt)),
    db
      .select({ total: count() })
      .from(serverInstances)
      .where(eq(serverInstances.userId, user.id)),
    db
      .select({ running: count() })
      .from(serverInstances)
      .where(
        and(
          eq(serverInstances.userId, user.id),
          inArray(serverInstances.status, ["running", "recovering"])
        )
      ),
    db
      .select({ n: count() })
      .from(userNotifications)
      .where(
        and(
          eq(userNotifications.userId, user.id),
          isNull(userNotifications.readAt)
        )
      ),
    db
      .select({ n: count() })
      .from(userNotifications)
      .where(
        and(
          eq(userNotifications.userId, user.id),
          isNull(userNotifications.readAt),
          inArray(userNotifications.severity, ["error", "critical"])
        )
      ),
    db
      .select({
        id: userNotifications.id,
        title: userNotifications.title,
        message: userNotifications.message,
        severity: userNotifications.severity,
        linkHref: userNotifications.linkHref,
        createdAt: userNotifications.createdAt,
      })
      .from(userNotifications)
      .where(eq(userNotifications.userId, user.id))
      .orderBy(desc(userNotifications.createdAt))
      .limit(10),
    db
      .select({
        hostId: serverInstances.hostId,
        n: count(),
      })
      .from(serverInstances)
      .where(eq(serverInstances.userId, user.id))
      .groupBy(serverInstances.hostId),
  ]);

  const enrolledHosts = hostRows.filter((h) => h.status !== "pending");
  const onlineCount = enrolledHosts.filter(
    (h) => effectiveHostStatus({ status: h.status, lastSeenAt: h.lastSeenAt }) === "online"
  ).length;

  const hostInstanceMap = new Map(
    instanceByHost
      .filter((r) => r.hostId != null)
      .map((r) => [r.hostId as string, Number(r.n)])
  );

  const totalInstances = Number(instanceTotalRow[0]?.total ?? 0);
  const runningInstances = Number(instanceRunningRow[0]?.running ?? 0);
  const unreadAlerts = Number(unreadRow[0]?.n ?? 0);
  const issueAlerts = Number(issueRow[0]?.n ?? 0);

  const healthOk = issueAlerts === 0;
  const displayHosts = enrolledHosts.slice(0, 8);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your hosts and game servers at a glance."
      />
      <div className="flex flex-1 flex-col gap-8 p-4 md:p-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border/80">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardDescription>Total hosts</CardDescription>
              <Server className="size-4 text-muted-foreground" aria-hidden />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums tracking-tight">
                {enrolledHosts.length}
              </p>
              <p className="text-xs text-muted-foreground">
                {onlineCount} online
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/80">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardDescription>Game servers</CardDescription>
              <Gamepad2 className="size-4 text-muted-foreground" aria-hidden />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums tracking-tight">
                {totalInstances}
              </p>
              <p className="text-xs text-muted-foreground">
                {runningInstances} running
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/80">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardDescription>Notifications</CardDescription>
              <Bell
                className={cn(
                  "size-4",
                  unreadAlerts > 0 ? "text-amber-500" : "text-muted-foreground"
                )}
                aria-hidden
              />
            </CardHeader>
            <CardContent>
              <p
                className={cn(
                  "text-3xl font-bold tabular-nums tracking-tight",
                  unreadAlerts > 0 && "text-amber-600 dark:text-amber-400"
                )}
              >
                {unreadAlerts}
              </p>
              <p className="text-xs text-muted-foreground">unread</p>
            </CardContent>
          </Card>
          <Card className="border-border/80">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardDescription>System health</CardDescription>
              <Activity className="size-4 text-muted-foreground" aria-hidden />
            </CardHeader>
            <CardContent>
              <p
                className={cn(
                  "text-sm font-semibold",
                  healthOk
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                )}
              >
                {healthOk
                  ? "All systems operational"
                  : `${issueAlerts} issue${issueAlerts === 1 ? "" : "s"} need attention`}
              </p>
              <p className="text-xs text-muted-foreground">
                Based on unread alerts
              </p>
            </CardContent>
          </Card>
        </section>

        <div className="grid gap-8 lg:grid-cols-3">
          <section className="space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight">Your hosts</h2>
              <Link
                href="/hosts"
                className="text-sm font-medium text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            {displayHosts.length === 0 ? (
              <Card className="border-dashed border-border/80 bg-muted/10">
                <CardHeader className="text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Server className="size-6" aria-hidden />
                  </div>
                  <CardTitle className="text-base">No hosts yet</CardTitle>
                  <CardDescription>
                    Add your first machine to deploy game servers from the catalog.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex justify-center pb-6">
                  <Link
                    href="/hosts"
                    className={buttonVariants({ size: "lg" })}
                  >
                    Add a host
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {displayHosts.map((h) => {
                  const metrics = h.hostMetrics as HostMetricsSnapshot | null;
                  const eff = effectiveHostStatus({
                    status: h.status,
                    lastSeenAt: h.lastSeenAt,
                  });
                  const dot =
                    eff === "online"
                      ? "online"
                      : eff === "offline"
                        ? "offline"
                        : "neutral";
                  const instN = hostInstanceMap.get(h.id) ?? 0;
                  return (
                    <li key={h.id}>
                      <Link href={`/hosts/${h.id}`} className="block">
                        <Card className="h-full border-border/80 transition-[box-shadow,transform] hover:border-primary/35 hover:shadow-md motion-reduce:transition-none">
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <StatusDot status={dot} />
                                <CardTitle className="truncate text-base">
                                  {h.name}
                                </CardTitle>
                              </div>
                              <Badge variant="secondary" className="shrink-0 capitalize">
                                {eff}
                              </Badge>
                            </div>
                            <CardDescription className="font-mono text-xs">
                              {primaryIp(metrics)}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="grid gap-2">
                              <MiniBar
                                label="CPU"
                                value={cpuPct(metrics)}
                              />
                              <MiniBar
                                label="RAM"
                                value={
                                  metrics?.memUsedPercent != null
                                    ? clampPct(metrics.memUsedPercent)
                                    : null
                                }
                              />
                              <MiniBar label="Disk" value={diskPct(metrics)} />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {instN} game server{instN === 1 ? "" : "s"} on this
                              host
                            </p>
                          </CardContent>
                        </Card>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight">Recent activity</h2>
              <Link
                href="/notifications"
                className="text-sm font-medium text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            <Card className="border-border/80">
              <CardContent className="space-y-0 divide-y divide-border/60 p-0">
                {recentNotes.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    No notifications yet. When hosts connect or servers change
                    state, updates appear here.
                  </p>
                ) : (
                  recentNotes.map((n) => {
                    const inner = (
                      <>
                        <div className="flex items-start gap-2">
                          <span
                            className={cn(
                              "mt-1.5 size-2 shrink-0 rounded-full",
                              n.severity === "error" || n.severity === "critical"
                                ? "bg-red-500"
                                : n.severity === "warning"
                                  ? "bg-amber-500"
                                  : "bg-sky-500"
                            )}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug">
                              {n.title}
                            </p>
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {n.message}
                            </p>
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {formatRelativeTime(n.createdAt)}
                            </p>
                          </div>
                        </div>
                      </>
                    );
                    return (
                      <div key={n.id} className="p-3">
                        {n.linkHref ? (
                          <Link
                            href={n.linkHref}
                            className="block rounded-md outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {inner}
                          </Link>
                        ) : (
                          inner
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </>
  );
}
