import type { ReactNode } from "react";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

type PageHeaderProps = {
  title: string;
  description?: string;
  /** Optional toolbar (e.g. back link, primary action). */
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex shrink-0 flex-col gap-3 border-b border-border/80 bg-background/80 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:flex-row md:items-center md:justify-between md:px-6">
      <div className="flex items-start gap-3">
        <SidebarTrigger
          className="-ml-1 shrink-0"
          title="Open navigation"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
            {title}
          </h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
          {actions}
        </div>
      ) : null}
      <Separator className="md:hidden" />
    </header>
  );
}
