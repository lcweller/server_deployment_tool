import Link from "next/link";
import { ArrowRight, Shield, Server, Gauge } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="relative flex min-h-svh flex-col">
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        <div className="absolute -left-1/4 top-0 h-[420px] w-[70%] rounded-full bg-primary/12 blur-3xl motion-reduce:opacity-50" />
        <div className="absolute -right-1/4 bottom-0 h-[380px] w-[60%] rounded-full bg-chart-2/15 blur-3xl motion-reduce:opacity-50" />
      </div>

      <header className="relative z-10 flex items-center justify-between border-b border-border/60 px-4 py-4 md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
            S
          </span>
          <span className="font-semibold tracking-tight">Steamline</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Log in
          </Link>
          <Link href="/register" className={buttonVariants({ size: "sm" })}>
            Get started
          </Link>
        </nav>
      </header>

      <main className="relative z-10 flex flex-1 flex-col px-4 pb-16 pt-12 md:px-8 md:pt-20">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Steam dedicated servers
          </p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            Deploy game servers with a calm, fast control plane.
          </h1>
          <p className="text-balance text-lg text-muted-foreground md:text-xl">
            Deploy servers from the catalog to your own hardware: enroll a host,
            choose a game, and let the agent install and run it—one dashboard for
            provisioning, logs, and lifecycle.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/register"
              className={cn(buttonVariants({ size: "lg" }), "gap-2")}
            >
              Start free beta
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/dashboard"
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              View dashboard UI
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-16 grid w-full max-w-5xl gap-4 md:grid-cols-3">
          {[
            {
              icon: Server,
              title: "Your hardware",
              text: "Steamline runs in the cloud; lightweight agents run on the Linux machines where your game servers live—VPS, home lab, or dedicated box.",
            },
            {
              icon: Shield,
              title: "Steam-first flows",
              text: "SteamCMD installs with anonymous-first defaults and clear credential modes when a title requires them.",
            },
            {
              icon: Gauge,
              title: "Operational clarity",
              text: "Streaming logs, seven-day beta retention with export, and room to grow into teams and billing.",
            },
          ].map((item) => (
            <Card
              key={item.title}
              className="border-border/80 bg-card/80 shadow-sm backdrop-blur-sm transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none"
            >
              <CardHeader className="gap-3">
                <item.icon
                  className="size-9 text-primary"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <CardTitle className="text-lg">{item.title}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  {item.text}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/60 px-4 py-6 text-center text-xs text-muted-foreground md:px-8">
        Steamline — private beta. UI shell only; API and agents ship in upcoming
        milestones.
      </footer>
    </div>
  );
}
