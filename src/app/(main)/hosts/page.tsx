import { desc, eq } from "drizzle-orm";
import Link from "next/link";

import { AddHostWizard } from "@/app/(main)/hosts/add-host-wizard";
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
import { hosts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const PLATFORM_LABEL: Record<string, string> = {
  linux: "Linux",
  macos: "macOS",
  windows: "Windows (WSL)",
};

export default async function HostsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const rows = await db
    .select({
      id: hosts.id,
      name: hosts.name,
      status: hosts.status,
      platformOs: hosts.platformOs,
      agentVersion: hosts.agentVersion,
      lastSeenAt: hosts.lastSeenAt,
      createdAt: hosts.createdAt,
    })
    .from(hosts)
    .where(eq(hosts.userId, user.id))
    .orderBy(desc(hosts.createdAt));

  return (
    <>
      <PageHeader
        title="Hosts"
        description="Pair machines with the Steamline agent. Add a host, run one command on the machine, then open it for details."
        actions={<AddHostWizard />}
      />
      <div className="flex flex-1 flex-col gap-8 p-4 md:p-6">
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">Your hosts</h2>
          {rows.length === 0 ? (
            <Card className="border-border/80 border-dashed">
              <CardHeader>
                <CardTitle className="text-base">No hosts yet</CardTitle>
                <CardDescription>
                  Use <span className="font-medium text-foreground">Add host</span>{" "}
                  above to name your machine and get the enroll command.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {rows.map((h) => (
                <li key={h.id}>
                  <Link href={`/hosts/${h.id}`} className="block">
                    <Card
                      className={cn(
                        "border-border/80 transition-[box-shadow,transform] duration-150",
                        "hover:border-primary/40 hover:shadow-md motion-reduce:transition-none"
                      )}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-base">{h.name}</CardTitle>
                          <Badge variant="secondary">{h.status}</Badge>
                        </div>
                        <CardDescription className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs">
                          <span className="truncate">{h.id}</span>
                          {h.platformOs ? (
                            <span>
                              {PLATFORM_LABEL[h.platformOs] ?? h.platformOs}
                            </span>
                          ) : null}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        {h.agentVersion ? (
                          <p>Agent: {h.agentVersion}</p>
                        ) : (
                          <p>Agent not enrolled yet.</p>
                        )}
                        {h.lastSeenAt ? (
                          <p className="text-xs">
                            Last seen:{" "}
                            {h.lastSeenAt.toLocaleString(undefined, {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </p>
                        ) : null}
                        {h.status === "pending_removal" ? (
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            Removal in progress — open this host for status.
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
