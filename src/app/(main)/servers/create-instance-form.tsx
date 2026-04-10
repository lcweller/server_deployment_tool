"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const selectClass = cn(
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm",
  "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
);

export type HostOption = { id: string; name: string; status: string };
export type CatalogOption = {
  id: string;
  name: string;
  slug: string;
  steamAppId: string;
};

type Props = {
  hosts: HostOption[];
  catalog: CatalogOption[];
  defaultCatalogId?: string;
};

export function CreateInstanceForm({
  hosts,
  catalog,
  defaultCatalogId,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [hostId, setHostId] = useState(
    () => hosts.find((h) => h.status !== "pending")?.id ?? ""
  );
  const [catalogEntryId, setCatalogEntryId] = useState(
    () =>
      defaultCatalogId && catalog.some((c) => c.id === defaultCatalogId)
        ? defaultCatalogId
        : catalog[0]?.id ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const eligibleHosts = hosts.filter((h) => h.status !== "pending");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          hostId,
          catalogEntryId,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to create server");
        return;
      }
      setName("");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  if (eligibleHosts.length === 0 || catalog.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 bg-muted/15 p-6">
        <p className="text-sm font-medium text-foreground">
          {eligibleHosts.length === 0
            ? "Connect a host first"
            : "Catalog is empty"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {eligibleHosts.length === 0
            ? "Add a host and run the one-line install on your game machine. When enrollment completes, return here to deploy."
            : "The dashboard normally ships with starter titles after deploy. If you still see this, open the catalog or ask your operator to run ingest."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/hosts"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            Hosts
          </Link>
          <Link
            href="/catalog"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            Catalog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-xl rounded-xl border border-border/80 bg-card/30 p-6 shadow-sm"
    >
      <div className="flex flex-col gap-4">
        <div className="space-y-2">
          <Label htmlFor="srv-name">Server name</Label>
          <Input
            id="srv-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. EU — Project Zomboid"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="srv-host">Host</Label>
          <select
            id="srv-host"
            className={selectClass}
            value={hostId}
            onChange={(e) => setHostId(e.target.value)}
            required
          >
            {eligibleHosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.status})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="srv-cat">Game (catalog)</Label>
          <select
            id="srv-cat"
            className={selectClass}
            value={catalogEntryId}
            onChange={(e) => setCatalogEntryId(e.target.value)}
            required
          >
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (App {c.steamAppId})
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Creating…" : "Create server"}
        </Button>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
