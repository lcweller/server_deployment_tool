import { desc } from "drizzle-orm";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { catalogEntries } from "@/db/schema";
import { launchPresetFor } from "@/lib/launch-presets";

export default async function CatalogPage() {
  const entries = await db
    .select()
    .from(catalogEntries)
    .orderBy(desc(catalogEntries.popularityScore));

  return (
    <>
      <PageHeader
        title="Game catalog"
        description="Games you can deploy to paired hosts. Sorted by catalog popularity (seed data and ingestion pipeline)."
      />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            type="search"
            placeholder="Search games…"
            className="max-w-md bg-card"
            disabled
            aria-describedby="catalog-search-hint"
          />
          <p id="catalog-search-hint" className="text-xs text-muted-foreground">
            Search and filters ship with the catalog API.
          </p>
        </div>

        {entries.length === 0 ? (
          <Card className="border-border/80 border-dashed">
            <CardHeader>
              <CardTitle className="text-base">No catalog rows yet</CardTitle>
              <CardDescription>
                Run migrations and{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  npm run db:seed
                </code>{" "}
                to insert demo titles.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {entries.map((row) => (
              <li key={row.id}>
                <Card className="h-full border-border/80 transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none">
                  <CardHeader className="gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">
                        {row.name}
                      </CardTitle>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {launchPresetFor(row.steamAppId) ? (
                          <Badge
                            variant="default"
                            className="text-[10px] font-normal"
                            title="GameServerOS ships a built-in launch preset for this Steam App ID"
                          >
                            Built-in preset
                          </Badge>
                        ) : null}
                        <Badge variant="secondary" className="tabular-nums">
                          {row.popularityScore}
                        </Badge>
                      </div>
                    </div>
                    <CardDescription className="font-mono text-xs">
                      App {row.steamAppId} · {row.slug}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <p className="text-sm text-muted-foreground">
                      Template metadata is stored as JSON for SteamCMD launch
                      recipes on the agent.
                    </p>
                    <Link
                      href={`/servers?catalog=${row.id}`}
                      className="inline-flex w-fit rounded-md border border-border/80 bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
                    >
                      Deploy to host
                    </Link>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
