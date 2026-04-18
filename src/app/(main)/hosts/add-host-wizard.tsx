"use client";

import type { ComponentProps } from "react";
import { CheckCircle2, Copy, Loader2, RefreshCw, Server } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import QRCode from "react-qr-code";

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
import { HOSTED_DASHBOARD_PUBLIC_URL } from "@/lib/hosted-dashboard-url";
import { useHostRealtimeForHost } from "@/lib/realtime/use-host-realtime-events";
import { cn } from "@/lib/utils";

/** Dispatched on `window` so any control (e.g. empty-state CTA) can open the sheet without prop drilling. */
export const OPEN_ADD_HOST_SHEET_EVENT = "gameserveros:open-add-host-sheet";

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

function clientOriginFallback(): string {
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
  return `curl -fsSL "${b}/install-agent.sh" | bash -s -- "${b}" "${token}"`;
}

function buildPairingShellCommand(baseUrl: string, code: string): string {
  const b = baseUrl.replace(/\/$/, "");
  return `curl -fsSL "${b}/install-agent.sh" | bash -s -- "${b}" --pairing-code "${code}"`;
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
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<string | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  /** Resolved after GET /api/config/dashboard-url — never use raw LAN origin for remote hosts when APP_PUBLIC_URL is set. */
  const [installBaseUrl, setInstallBaseUrl] = useState<string | null>(null);
  const [installUrlLoading, setInstallUrlLoading] = useState(false);
  const [usedPublicAppUrl, setUsedPublicAppUrl] = useState(false);
  const [showPublicUrlHint, setShowPublicUrlHint] = useState(false);

  const reset = useCallback(() => {
    setStep(1);
    setName("");
    setPlatformOs("linux");
    setError(null);
    setPending(false);
    setCreatedHostId(null);
    setEnrollmentToken(null);
    setPairingCode(null);
    setPairingExpiresAt(null);
    setPairingBusy(false);
    setPairingError(null);
    setEnrolled(false);
    setPollTimedOut(false);
    setInstallBaseUrl(null);
    setInstallUrlLoading(false);
    setUsedPublicAppUrl(false);
    setShowPublicUrlHint(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_ADD_HOST_SHEET_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ADD_HOST_SHEET_EVENT, onOpen);
  }, []);

  async function requestPairingCode(hostId: string) {
    setPairingBusy(true);
    setPairingError(null);
    try {
      const pr = await fetch(`/api/hosts/${hostId}/pairing-code`, {
        method: "POST",
      });
      const pj = (await pr.json()) as {
        pairingCode?: string;
        expiresAt?: string;
        message?: string;
        error?: string;
      };
      if (!pr.ok) {
        setPairingCode(null);
        setPairingExpiresAt(null);
        setPairingError(
          pj.message ??
            pj.error ??
            "Could not create a pairing code. You can still use the advanced install command."
        );
        return;
      }
      if (pj.pairingCode && pj.expiresAt) {
        setPairingCode(pj.pairingCode);
        setPairingExpiresAt(pj.expiresAt);
      }
    } catch {
      setPairingError(
        "Could not create a pairing code. You can still use the advanced install command."
      );
    } finally {
      setPairingBusy(false);
    }
  }

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
        await requestPairingCode(data.host.id);
        setStep(3);
      }
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  async function regeneratePairingCode() {
    if (!createdHostId) {
      return;
    }
    await requestPairingCode(createdHostId);
  }

  const checkEnrollmentStatus = useCallback(
    async (id: string): Promise<void> => {
      try {
        const res = await fetch(`/api/hosts/${id}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as {
          host?: { status: string };
        };
        if (data.host && data.host.status !== "pending") {
          setEnrolled(true);
          router.refresh();
        }
      } catch {
        /* ignore */
      }
    },
    [router]
  );

  useEffect(() => {
    if (step !== 3 || !createdHostId || enrolled) {
      return;
    }
    let cancelled = false;
    const startedAt = Date.now();
    const timeoutMs = 6 * 60_000;

    const checkEnrollment = async () => {
      if (cancelled) {
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        setPollTimedOut(true);
        return;
      }
      await checkEnrollmentStatus(createdHostId);
    };

    void checkEnrollment();
    const fallback = window.setInterval(() => {
      void checkEnrollment();
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(fallback);
    };
  }, [step, createdHostId, enrolled, checkEnrollmentStatus]);

  useHostRealtimeForHost(createdHostId, () => {
    if (step !== 3 || enrolled || !createdHostId) {
      return;
    }
    void checkEnrollmentStatus(createdHostId);
  });

  useEffect(() => {
    if (step !== 3) {
      return;
    }
    setInstallUrlLoading(true);
    setInstallBaseUrl(null);
    let cancelled = false;
    fetch("/api/config/dashboard-url")
      .then(async (res) => {
        const j = (await res.json()) as {
          dashboardUrl?: string;
          usedPublicEnv?: boolean;
        };
        if (cancelled) {
          return;
        }
        const u = j.dashboardUrl?.replace(/\/$/, "").trim();
        if (u) {
          setInstallBaseUrl(u);
          setUsedPublicAppUrl(Boolean(j.usedPublicEnv));
        } else {
          setInstallBaseUrl(clientOriginFallback());
          setUsedPublicAppUrl(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInstallBaseUrl(clientOriginFallback());
          setUsedPublicAppUrl(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInstallUrlLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [step]);

  useEffect(() => {
    if (!usedPublicAppUrl || !installBaseUrl) {
      setShowPublicUrlHint(false);
      return;
    }
    setShowPublicUrlHint(clientOriginFallback() !== installBaseUrl);
  }, [usedPublicAppUrl, installBaseUrl]);

  const shellCmd =
    enrollmentToken && installBaseUrl
      ? buildEnrollShellCommand(installBaseUrl, enrollmentToken)
      : "";

  const pairingShellCmd =
    pairingCode && installBaseUrl
      ? buildPairingShellCommand(installBaseUrl, pairingCode)
      : "";

  const osNote =
    platformOs === "windows"
      ? "Install WSL 2 (Ubuntu), install Node.js 18+ inside WSL, then paste the command in that Linux shell."
      : platformOs === "macos"
        ? "Requires Node.js 18+ and curl. One command enrolls and starts the agent in the background."
        : "Requires Node.js 18+ and curl. On minimal Ubuntu, pipe the script to sudo bash so it can install bash, tar, and 32-bit libs for SteamCMD. Only one agent per machine — use the dashboard to add multiple game servers to that host.";

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
            Name the machine, pick an OS, then link it with a short pairing code
            (easiest) or the advanced one-line command. The agent starts in the
            background — you do not need SSH for normal operation.{" "}
            <Link className="text-primary underline" href="/docs/getting-started">
              GameServerOS and getting started
            </Link>
            .
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

                  {pairingError ? (
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      {pairingError}
                    </p>
                  ) : null}

                  {pairingCode ? (
                    <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/[0.04] p-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Pairing code
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Enter this on the machine when asked (for example in the
                          GameServerOS installer), or scan the QR code with your
                          phone to read the code aloud. This code expires after a
                          short time — use &quot;New code&quot; if it runs out.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-start gap-6">
                        <div className="rounded-lg border border-border/80 bg-background p-3">
                          <QRCode
                            value={pairingCode}
                            size={148}
                            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                            viewBox="0 0 256 256"
                          />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <p
                            className="font-mono text-2xl font-semibold tracking-[0.2em] text-foreground"
                            translate="no"
                          >
                            {pairingCode}
                          </p>
                          {pairingExpiresAt ? (
                            <p className="text-[11px] text-muted-foreground">
                              Valid until{" "}
                              {new Date(pairingExpiresAt).toLocaleString(undefined, {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="gap-1"
                              onClick={async () => {
                                await navigator.clipboard.writeText(pairingCode);
                              }}
                            >
                              <Copy className="size-3.5" />
                              Copy code
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              disabled={pairingBusy}
                              onClick={() => void regeneratePairingCode()}
                            >
                              {pairingBusy ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="size-3.5" />
                              )}
                              New code
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">One-line install (recommended)</Label>
                        <div className="relative rounded-md border border-border/80 bg-muted/30 p-3 font-mono text-[11px] leading-relaxed break-all">
                          {installUrlLoading && !installBaseUrl ? (
                            <span className="inline-flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="size-3.5 animate-spin" />
                              Resolving dashboard URL…
                            </span>
                          ) : (
                            pairingShellCmd || "…"
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="gap-1"
                          disabled={!pairingShellCmd || installUrlLoading}
                          onClick={async () => {
                            if (pairingShellCmd) {
                              await navigator.clipboard.writeText(pairingShellCmd);
                            }
                          }}
                        >
                          <Copy className="size-3.5" />
                          Copy install command
                        </Button>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          Manual enroll (if you already have{" "}
                          <code className="rounded bg-muted px-1 font-mono text-[10px]">
                            steamline-agent.cjs
                          </code>
                          ):{" "}
                          <code className="rounded bg-muted px-1 font-mono text-[10px]">
                            node steamline-agent.cjs enroll{" "}
                            {installBaseUrl ?? "<dashboard-url>"} --pairing-code{" "}
                            {pairingCode}
                          </code>
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3 text-xs">
                    {process.env.NEXT_PUBLIC_GAMESERVEROS_ISO_URL ? (
                      <Link
                        href={process.env.NEXT_PUBLIC_GAMESERVEROS_ISO_URL}
                        className="text-primary underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        GameServerOS download
                      </Link>
                    ) : null}
                    {process.env.NEXT_PUBLIC_INSTALL_DOC_URL ? (
                      <Link
                        href={process.env.NEXT_PUBLIC_INSTALL_DOC_URL}
                        className="text-primary underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Installation help
                      </Link>
                    ) : null}
                  </div>

                  {showPublicUrlHint ? (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-100">
                      <p className="font-medium text-foreground">
                        Public URL for this command
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        The command uses{" "}
                        <span className="font-mono text-foreground">
                          {installBaseUrl}
                        </span>{" "}
                        (from <code className="rounded bg-muted px-1">APP_PUBLIC_URL</code>)
                        so the agent can reach this dashboard. Browsing via a
                        LAN address is fine; the host still needs a URL it can route
                        to — not only{" "}
                        <span className="font-mono">192.168.x.x</span>.
                      </p>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
                    {pollTimedOut ? (
                      <span className="text-amber-700 dark:text-amber-300">
                        Still waiting — finish linking on the host, or check
                        connectivity. You can open &quot;Advanced&quot; below and use
                        the token command if pairing is not available.
                      </span>
                    ) : (
                      <>
                        <Loader2 className="size-3.5 shrink-0 animate-spin" />
                        <span>Waiting for enrollment…</span>
                      </>
                    )}
                  </div>

                  <details className="group rounded-lg border border-border/80 bg-muted/10">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-foreground">
                      Advanced: one-line install with secret token
                    </summary>
                    <div className="space-y-2 border-t border-border/60 px-3 py-3">
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        For your own Linux server, you can still paste this once in
                        a terminal. It uses a long secret instead of the pairing
                        code.
                      </p>
                      <Label className="text-xs">Run once on the game host</Label>
                      <div className="relative rounded-md border border-border/80 bg-muted/30 p-3 font-mono text-xs leading-relaxed break-all">
                        {installUrlLoading && !installBaseUrl ? (
                          <span className="inline-flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="size-3.5 animate-spin" />
                            Resolving dashboard URL…
                          </span>
                        ) : (
                          shellCmd || "…"
                        )}
                      </div>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Run this only on{" "}
                        <strong className="font-medium text-foreground">
                          each machine where you want to run game servers
                        </strong>
                        . The hosted dashboard is at{" "}
                        <span className="font-mono text-foreground/90">
                          {HOSTED_DASHBOARD_PUBLIC_URL}
                        </span>
                        — this command installs the agent so you can{" "}
                        <strong className="font-medium text-foreground">
                          deploy servers from the dashboard
                        </strong>
                        , not host the platform yourself.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="gap-1"
                          disabled={!shellCmd || installUrlLoading}
                          onClick={async () => {
                            if (shellCmd) {
                              await navigator.clipboard.writeText(shellCmd);
                            }
                          }}
                        >
                          <Copy className="size-3.5" />
                          Copy command
                        </Button>
                      </div>
                    </div>
                  </details>
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

export function OpenAddHostSheetButton({
  children,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      {...props}
      onClick={(e) => {
        props.onClick?.(e);
        if (!e.defaultPrevented) {
          window.dispatchEvent(new CustomEvent(OPEN_ADD_HOST_SHEET_EVENT));
        }
      }}
    >
      {children}
    </Button>
  );
}
