import fs from "node:fs/promises";
import path from "node:path";

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
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Documentation"
        description={
          <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <Link className="text-primary underline-offset-4 hover:underline" href="/docs/getting-started">
              Getting started
            </Link>
            <Link className="text-primary underline-offset-4 hover:underline" href="/docs/management">
              Management
            </Link>
            <Link className="text-primary underline-offset-4 hover:underline" href="/docs/troubleshooting">
              Troubleshooting
            </Link>
            <Link className="text-primary underline-offset-4 hover:underline" href="/docs/technical-reference">
              Technical reference
            </Link>
          </span>
        }
      />
      <article
        className="docs-markdown max-w-none text-sm"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
