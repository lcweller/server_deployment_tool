import Link from "next/link";
import { desc, eq } from "drizzle-orm";

import { CreateInstanceForm } from "@/app/(main)/servers/create-instance-form";
import { DeleteInstanceButton } from "@/components/delete-instance-button";
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
        provisionMessage: serverInstances.provisionMessage,
        lastError: serverInstances.lastError,
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

  return (
    <>
      <PageHeader
        title="Servers"
        description="Create a server on an enrolled host. The agent downloads SteamCMD if needed and provisions with the real Steam client (set STEAMLINE_PROVISION_STUB=1 only to skip downloads for quick tests)."
      />
      <div className="flex flex-1 flex-col gap-8 p-4 md:p-6">
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">
            New server
          </h2>
          <p className="max-w-xl text-xs text-muted-foreground">
            New servers start as <span className="text-foreground">queued</span>.
            On the host,{" "}
            <code className="rounded bg-muted px-1">npm run agent -- run &lt;URL&gt;</code>{" "}
            picks them up: <span className="text-foreground">installing</span> →{" "}
            <span className="text-foreground">running</span> (real SteamCMD unless{" "}
            <code className="rounded bg-muted px-1">STEAMLINE_PROVISION_STUB=1</code>).
          </p>
          <CreateInstanceForm
            hosts={hostRows}
            catalog={catalogRows}
            defaultCatalogId={defaultCatalogId}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">Your servers</h2>
          {instanceRows.length === 0 ? (
            <Card className="border-border/80 border-dashed">
              <CardHeader>
                <CardTitle className="text-base">No servers yet</CardTitle>
                <CardDescription>
                  Use the form above, or open the{" "}
                  <Link href="/catalog" className="text-primary underline">
                    catalog
                  </Link>{" "}
                  and click <span className="font-medium">Deploy</span> on a
                  title.
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
                            <Badge variant="secondary">{row.status}</Badge>
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
                    <CardContent className="space-y-1 text-xs text-muted-foreground">
                      {row.lastError ? (
                        <p className="text-destructive">{row.lastError}</p>
                      ) : row.provisionMessage ? (
                        <p>{row.provisionMessage}</p>
                      ) : null}
                      <p>
                        Updated{" "}
                        {row.updatedAt.toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
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
