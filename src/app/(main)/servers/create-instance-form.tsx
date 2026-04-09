"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
      <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-4 text-sm text-muted-foreground">
        {eligibleHosts.length === 0
          ? "You need at least one enrolled host (not pending) before creating a server."
          : "Add catalog titles (seed or run catalog ingest) before creating a server."}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
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
        <Label htmlFor="srv-cat">Catalog title</Label>
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
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create server"}
      </Button>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
