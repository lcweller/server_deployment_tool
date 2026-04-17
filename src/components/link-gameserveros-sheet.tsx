"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function LinkGameServerOsSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/hosts/gameserveros-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingCode: code.trim(), name: name.trim() || "My Game Server" }),
      });
      const j = (await res.json()) as { host?: { id: string }; message?: string; error?: string };
      if (!res.ok) {
        setErr(
          typeof j.message === "string"
            ? j.message
            : j.error ?? "Could not link this code. Check the code and try again."
        );
        return;
      }
      if (j.host?.id) {
        setOpen(false);
        router.push(`/hosts/${j.host.id}`);
        router.refresh();
      }
    } catch {
      setErr("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={cn(buttonVariants({ variant: "outline" }), "inline-flex")}
      >
        Link GameServerOS
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle>Link a GameServerOS machine</SheetTitle>
          <SheetDescription>
            Enter the pairing code shown on your server&apos;s screen, and a name for this host.{" "}
            <Link className="text-primary underline" href="/docs/getting-started">
              Step-by-step guide
            </Link>
            .
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-2">
          <Label htmlFor="gso-name">Server name</Label>
          <Input
            id="gso-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Game Server"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gso-code">Pairing code from the installer</Label>
          <Input
            id="gso-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD-1234"
            autoComplete="off"
          />
        </div>
        {err ? <p className="text-destructive text-sm">{err}</p> : null}
        <Button type="button" disabled={busy || !code.trim()} onClick={() => void submit()}>
          {busy ? "Linking…" : "Link host"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
