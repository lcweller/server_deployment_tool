import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Download,
  Gamepad2,
  HardDrive,
  LayoutDashboard,
  LifeBuoy,
  MonitorPlay,
  Rocket,
  Shield,
  Zap,
  Code2,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const GAMES = [
  { name: "Valheim", abbr: "V", hue: "142 76% 42%" },
  { name: "Minecraft", abbr: "M", hue: "142 70% 45%" },
  { name: "Counter-Strike 2", abbr: "CS", hue: "210 90% 48%" },
  { name: "ARK", abbr: "A", hue: "25 90% 52%" },
  { name: "Rust", abbr: "R", hue: "0 70% 55%" },
  { name: "Terraria", abbr: "T", hue: "265 70% 58%" },
  { name: "7 Days to Die", abbr: "7", hue: "32 85% 48%" },
  { name: "Project Zomboid", abbr: "PZ", hue: "95 45% 42%" },
] as const;

export const metadata: Metadata = {
  title: {
    absolute: "GameServerOS — Host game servers in minutes",
  },
  description:
    "Download GameServerOS, pair your machine with a simple code, and deploy dedicated servers for Valheim, Minecraft, and more — no Linux experience required.",
};

const FEATURES = [
  {
    icon: Zap,
    title: "One-click deployment",
    text: "Pick a game from the catalog and launch it on your machine — no scripts or ports to memorize.",
  },
  {
    icon: Shield,
    title: "Automatic security",
    text: "Firewall and updates are handled for you so you can focus on playing, not patching.",
  },
  {
    icon: MonitorPlay,
    title: "Remote management",
    text: "Start, stop, and restart servers from any browser — your phone works too.",
  },
  {
    icon: HardDrive,
    title: "Backups",
    text: "Schedule saves to the cloud or another disk so you never lose a world.",
  },
  {
    icon: Bell,
    title: "Real-time monitoring",
    text: "See CPU, memory, and alerts when something needs your attention.",
  },
  {
    icon: Gamepad2,
    title: "No technical knowledge",
    text: "Built for friends-and-family crews — if you can use a website, you can host.",
  },
] as const;

export default function HomePage() {
  const year = new Date().getFullYear();

  return (
    <div className="relative flex min-h-svh flex-col bg-background">
      {/* Subtle grid + gradients */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: `linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px)`,
            backgroundSize: "48px 48px",
          }}
        />
        <div className="absolute -left-1/4 top-0 h-[min(520px,50vh)] w-[75%] rounded-full bg-primary/15 blur-3xl motion-reduce:opacity-60" />
        <div className="absolute -right-1/4 bottom-0 h-[min(480px,45vh)] w-[65%] rounded-full bg-sky-500/10 blur-3xl motion-reduce:opacity-60" />
      </div>

      <header className="relative z-10 border-b border-border/80 bg-background/75 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm">
              G
            </span>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              GameServerOS
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/docs"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Docs
            </Link>
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
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col">
        {/* Hero */}
        <section className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 pb-20 pt-16 text-center md:pb-28 md:pt-24">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Game server hosting for everyone
          </p>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
            Host game servers in minutes — no Linux degree required
          </h1>
          <p className="mt-5 max-w-2xl text-balance text-lg text-muted-foreground md:text-xl">
            Download our easy installer, connect your PC or VPS to the dashboard,
            and deploy Valheim, Minecraft, and more. We handle the boring stuff so
            you and your friends can play.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className={cn(buttonVariants({ size: "lg" }), "gap-2")}
            >
              Get started
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="#features"
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              Learn more
            </Link>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          className="border-y border-border/80 bg-muted/20 py-16 md:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                How it works
              </h2>
              <p className="mt-2 text-sm text-muted-foreground md:text-base">
                Three steps from zero to “we’re online.”
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                {
                  step: "1",
                  title: "Download & install",
                  text: "Flash GameServerOS to a USB or VPS, boot once, and follow the simple on-screen prompts.",
                  icon: Download,
                },
                {
                  step: "2",
                  title: "Connect to the dashboard",
                  text: "Enter the pairing code from your browser so this machine shows up in your account.",
                  icon: LayoutDashboard,
                },
                {
                  step: "3",
                  title: "Deploy game servers",
                  text: "Choose a game, click deploy, and invite your friends — we wire up ports and updates.",
                  icon: Rocket,
                },
              ].map((item) => (
                <Card
                  key={item.step}
                  className="border-border/80 bg-card/90 shadow-sm backdrop-blur-sm"
                >
                  <CardHeader className="gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                        {item.step}
                      </span>
                      <item.icon
                        className="size-8 text-primary"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    </div>
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                    <CardDescription className="text-sm leading-relaxed">
                      {item.text}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                Everything you need
              </h2>
              <p className="mt-2 text-sm text-muted-foreground md:text-base">
                Built for people who want to play, not read man pages.
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((item) => (
                <Card
                  key={item.title}
                  className="border-border/80 bg-card/80 transition-shadow hover:shadow-md"
                >
                  <CardHeader className="gap-3">
                    <item.icon
                      className="size-8 text-primary"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <CardDescription className="text-sm leading-relaxed">
                      {item.text}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Supported games */}
        <section id="games" className="border-t border-border/80 bg-muted/15 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                Supported games
              </h2>
              <p className="mt-2 text-sm text-muted-foreground md:text-base">
                Popular titles — with more added regularly.
              </p>
            </div>
            <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
              {GAMES.map((g) => (
                <div
                  key={g.name}
                  className="flex flex-col items-center gap-3 rounded-lg border border-border/80 bg-card/90 p-4 text-center shadow-sm transition-transform hover:-translate-y-0.5 motion-reduce:transform-none"
                >
                  <div
                    className="flex size-14 items-center justify-center rounded-lg text-sm font-bold text-white shadow-inner"
                    style={{ backgroundColor: `hsl(${g.hue})` }}
                  >
                    {g.abbr}
                  </div>
                  <span className="text-xs font-medium leading-tight text-foreground">
                    {g.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section
          id="cta"
          className="border-t border-border/80 bg-gradient-to-b from-primary/10 to-transparent py-16 md:py-20"
        >
          <div className="mx-auto max-w-2xl px-4 text-center md:px-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Ready to start?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Create a free account and add your first host in minutes.
            </p>
            <Link
              href="/register"
              className={cn(
                buttonVariants({ size: "lg" }),
                "mt-8 inline-flex gap-2"
              )}
            >
              Create your account
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/80 bg-background/90 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 px-4 md:flex-row md:px-6">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <Link
              href="/docs"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <BookOpen className="size-4" aria-hidden />
              Documentation
            </Link>
            <Link
              href="/docs/troubleshooting"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <LifeBuoy className="size-4" aria-hidden />
              Support
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Code2 className="size-4" aria-hidden />
              GitHub
            </a>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            © {year} GameServerOS. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
