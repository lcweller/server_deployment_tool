"use client";

import { CheckCircle2, Copy, Loader2, Monitor, Server } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type PlatformOs = "linux" | "macos" | "windows";

const OS_OPTIONS: {
  id: PlatformOs;
  title: string;
  description: string;
}[] = [
  {
    id: "linux",
    title: "Linux",
    description: "Bare metal or VM (recommended for game servers)",
  },
  {
    id: "macos",
    title: "macOS",
    description: "Local development machine",
  },
  {
    id: "windows",
    title: "Windows",
    description: "Use WSL 2 with Ubuntu — run the command inside WSL",
  },
];

function dashboardBaseUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) {
    return fromEnv;
  }
  return window.location.origin;
}

function buildEnrollShellCommand(baseUrl: string, token: string): string {
  const b = baseUrl.replace(/\/$/, "");
  return `npm run agent -- enroll "${b}" "${token}"`;
}

export function AddHostWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [platformOs, setPlatformOs] = useState<PlatformOs>("linux");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [createdHostId, setCreatedHostId] = useState<string | null>(null);
  const [enrollmentToken, setEnrollmentToken] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [pollTimedOut, setPollTimedOut] = useState(false);

  const reset = useCallback(() => {
    setStep(1);
    setName("");
    setPlatformOs("linux");
    setError(null);
    setPending(false);
    setCreatedHostId(null);
    setEnrollmentToken(null);
    setEnrolled(false);
    setPollTimedOut(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  async function createHost() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/hosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), platformOs }),
      });
      const data = (await res.json()) as {
        host?: { id: string };
        enrollmentToken?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Failed to create host");
        return;
      }
      if (data.host?.id && data.enrollmentToken) {
        setCreatedHostId(data.host.id);
        setEnrollmentToken(data.enrollmentToken);
        setStep(3);
      }
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (step !== 3 || !createdHostId || enrolled) {
      return;
    }
    let attempts = 0;
    const maxAttempts = 180;
    const t = window.setInterval(async () => {
      attempts += 1;
      if (attempts > maxAttempts) {
        setPollTimedOut(true);
        window.clearInterval(t);
        return;
      }
      try {
        const res = await fetch(`/api/hosts/${createdHostId}`);
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as {
          host?: { status: string };
        };
        if (data.host && data.host.status !== "pending") {
          setEnrolled(true);
          window.clearInterval(t);
          router.refresh();
        }
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => window.clearInterval(t);
  }, [step, createdHostId, enrolled, router]);

  const base = dashboardBaseUrl();
  const shellCmd =
    enrollmentToken && base
      ? buildEnrollShellCommand(base, enrollmentToken)
      : "";

  const osNote =
    platformOs === "windows"
      ? "Install WSL 2 (Ubuntu), install Node.js inside WSL, clone or copy this project, then run the command in that Linux shell."
      : platformOs === "macos"
        ? "Run the command from your Steamline project directory where package.json lives."
        : "Run the command on the host from your Steamline project directory (where package.json lives).";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={cn(buttonVariants({ variant: "default" }), "gap-2")}
      >
        <Server className="size-4" aria-hidden />
        Add host
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full max-w-lg flex-col">
        <SheetHeader>
          <SheetTitle>Add host</SheetTitle>
          <SheetDescription>
            Name the machine, pick an OS, then run one command on the host to
            enroll the agent.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
          <div className="flex gap-2 text-xs text-muted-foreground">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={cn(
                  "flex flex-1 items-center justify-center rounded-md border py-2 font-medium",
                  step === n
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border/80"
                )}
              >
                {n === 1 && "Name"}
                {n === 2 && "System"}
                {n === 3 && "Enroll"}
              </div>
            ))}
          </div>

          {step === 1 ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="wizard-host-name">Host name</Label>
                <Input
                  id="wizard-host-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Hetzner CX33 — EU West"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  This label is only for you; it appears in the dashboard.
                </p>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <Label>Operating system</Label>
              <div className="grid gap-2">
                {OS_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPlatformOs(opt.id)}
                    className={cn(
                      "flex w-full flex-col items-start rounded-lg border px-3 py-3 text-left text-sm transition-colors",
                      platformOs === opt.id
                        ? "border-primary bg-primary/5"
                        : "border-border/80 hover:bg-muted/40"
                    )}
                  >
                    <span className="font-medium text-foreground">
                      {opt.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {opt.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              {enrolled ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 py-8 text-center">
                  <CheckCircle2
                    className="size-12 text-primary"
                    aria-hidden
                  />
                  <p className="text-sm font-medium text-foreground">
                    Host enrolled
                  </p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    This machine is now linked to your account. Heartbeats will
                    keep it marked online.
                  </p>
                  {createdHostId ? (
                    <Link
                      href={`/hosts/${createdHostId}`}
                      className={cn(
                        buttonVariants({ variant: "default" }),
                        "mt-2"
                      )}
                      onClick={() => setOpen(false)}
                    >
                      View host details
                    </Link>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-border/80 bg-muted/20 p-3 text-xs text-muted-foreground">
                    <p>{osNote}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Run on the host</Label>
                    <div className="relative rounded-md border border-border/80 bg-muted/30 p-3 font-mono text-xs leading-relaxed break-all">
                      {shellCmd || "…"}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="gap-1"
                        disabled={!shellCmd}
                        onClick={async () => {
                          if (shellCmd) {
                            await navigator.clipboard.writeText(shellCmd);
                          }
                        }}
                      >
                        <Copy className="size-3.5" />
                        Copy command
                      </Button>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {pollTimedOut ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            Still waiting — run the command on the host, or
                            check connectivity.
                          </span>
                        ) : (
                          <>
                            <Loader2 className="size-3.5 animate-spin" />
                            Waiting for enrollment…
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <SheetFooter className="border-t border-border/80 sm:flex-row sm:justify-between">
          {step === 1 ? (
            <>
              <SheetClose
                className={cn(buttonVariants({ variant: "ghost" }))}
              >
                Cancel
              </SheetClose>
              <Button
                type="button"
                onClick={() => setStep(2)}
                disabled={!name.trim()}
              >
                Continue
              </Button>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button
                type="button"
                className="gap-2"
                onClick={() => void createHost()}
                disabled={pending}
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create & show command"
                )}
              </Button>
            </>
          ) : null}
          {step === 3 && !enrolled ? (
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          ) : null}
          {step === 3 && enrolled ? (
            <SheetClose className={cn(buttonVariants({ variant: "secondary" }))}>
              Close
            </SheetClose>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
