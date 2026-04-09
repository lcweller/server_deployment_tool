import { and, count, eq, ne } from "drizzle-orm";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { catalogEntries, hosts, serverInstances } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const [[{ catalogCount }], [{ hostCount }], [{ instanceCount }]] =
    await Promise.all([
      db.select({ catalogCount: count() }).from(catalogEntries),
      db
        .select({ hostCount: count() })
        .from(hosts)
        .where(
          and(eq(hosts.userId, user.id), ne(hosts.status, "pending"))
        ),
      db
        .select({ instanceCount: count() })
        .from(serverInstances)
        .where(eq(serverInstances.userId, user.id)),
    ]);

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Signed in as ${user?.email ?? "unknown"}. Hosts, servers, and jobs will surface here as the agent and API land.`}
      />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Enrolled hosts",
              value: String(hostCount),
              hint: "Hosts that finished agent enrollment",
            },
            {
              label: "Server instances",
              value: String(instanceCount),
              hint: "SteamCMD-managed instances (draft or live)",
            },
            {
              label: "Catalog titles",
              value: String(catalogCount),
              hint: "Steam-derived list + templates",
            },
            {
              label: "Log retention",
              value: "7 days",
              hint: "Beta default; export anytime",
            },
          ].map((stat) => (
            <Card
              key={stat.label}
              className="border-border/80 shadow-sm transition-[box-shadow,transform] duration-150 ease-out hover:shadow-md motion-reduce:transition-none"
            >
              <CardHeader className="pb-2">
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className="text-3xl font-semibold tabular-nums tracking-tight">
                  {stat.value}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {stat.hint}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/80">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Recent activity</CardTitle>
                <Badge variant="secondary">Coming soon</Badge>
              </div>
              <CardDescription>
                Install jobs, restarts, and agent events will stream here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No events yet. Connect a host agent to see lifecycle updates.
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="text-base">Next steps</CardTitle>
              <CardDescription>
                A short checklist for your first dedicated server.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
                <li>Verify your email and enroll a host (Add host wizard).</li>
                <li>Optional: run catalog ingest for more Steam titles.</li>
                <li>
                  Open <span className="text-foreground">Servers</span> and create
                  an instance from the catalog.
                </li>
                <li>
                  Keep{" "}
                  <code className="rounded bg-muted px-1 text-xs">
                    npm run agent -- run &lt;URL&gt;
                  </code>{" "}
                  on the host — it provisions queued servers (stub or SteamCMD).
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
