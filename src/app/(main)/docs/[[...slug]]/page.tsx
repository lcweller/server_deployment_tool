import fs from "node:fs/promises";
import path from "node:path";

import type { ReactNode } from "react";
import Link from "next/link";
import { marked } from "marked";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";

const ALLOWED = new Set([
  "getting-started",
  "management",
  "troubleshooting",
  "technical-reference",
]);

function slugToFile(slug: string[]): string | null {
  if (slug.length !== 1) {
    return null;
  }
  const s = slug[0]!;
  if (!ALLOWED.has(s)) {
    return null;
  }
  return `${s}.md`;
}

export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug: raw } = await params;
  const slug = raw?.length ? raw : ["getting-started"];
  const file = slugToFile(slug);
  if (!file) {
    notFound();
  }

  const abs = path.join(process.cwd(), "docs", file);
  let md: string;
  try {
    md = await fs.readFile(abs, "utf8");
  } catch {
    notFound();
  }

  const html = await marked.parse(md, { gfm: true, breaks: false });

  return (
    <>
      <PageHeader
        title="Documentation"
        description={
          <span>
            Guides for GameServerOS — agents, hosts, and game servers. Jump to a
            section:
          </span>
        }
      />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <nav
          aria-label="Documentation sections"
          className="flex max-w-3xl flex-wrap gap-2"
        >
          <DocNavLink href="/docs/getting-started" current={slug[0] === "getting-started"}>
            Getting started
          </DocNavLink>
          <DocNavLink href="/docs/management" current={slug[0] === "management"}>
            Management
          </DocNavLink>
          <DocNavLink
            href="/docs/troubleshooting"
            current={slug[0] === "troubleshooting"}
          >
            Troubleshooting
          </DocNavLink>
          <DocNavLink
            href="/docs/technical-reference"
            current={slug[0] === "technical-reference"}
          >
            Technical reference
          </DocNavLink>
        </nav>
        <article
          className="docs-markdown mx-auto w-full max-w-3xl text-sm"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </>
  );
}

function DocNavLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        current
          ? "rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-foreground"
          : "rounded-lg border border-border/80 bg-muted/20 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted/40 hover:text-foreground"
      }
      aria-current={current ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
