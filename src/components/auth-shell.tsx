import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared marketing-style backdrop + logo for `/login` and `/register`.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col bg-background">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: `linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px)`,
            backgroundSize: "48px 48px",
          }}
        />
        <div className="absolute -left-1/4 top-0 h-[min(420px,45vh)] w-[70%] rounded-full bg-primary/12 blur-3xl motion-reduce:opacity-60" />
        <div className="absolute -right-1/4 bottom-0 h-[min(380px,40vh)] w-[60%] rounded-full bg-sky-500/10 blur-3xl motion-reduce:opacity-60" />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Link
          href="/"
          className="mb-8 flex items-center gap-2.5 text-foreground transition-opacity hover:opacity-90"
        >
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm">
            G
          </span>
          <span className="text-lg font-semibold tracking-tight">GameServerOS</span>
        </Link>
        {children}
      </div>
    </div>
  );
}
