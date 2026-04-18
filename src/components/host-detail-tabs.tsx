"use client";

import { Database, LayoutDashboard, Server, Wrench } from "lucide-react";
import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { HostDetailTabId } from "@/lib/host-detail-tabs";
import { cn } from "@/lib/utils";

type Props = {
  overview: ReactNode;
  servers: ReactNode;
  backups: ReactNode;
  tools: ReactNode;
  defaultTab?: HostDetailTabId;
};

export function HostDetailTabs({
  overview,
  servers,
  backups,
  tools,
  defaultTab = "overview",
}: Props) {
  return (
    <Tabs defaultValue={defaultTab} className="gap-0">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-fit">
        <TabsTrigger value="overview" className="gap-1.5">
          <LayoutDashboard className="size-3.5 shrink-0" aria-hidden />
          Overview
        </TabsTrigger>
        <TabsTrigger value="servers" className="gap-1.5">
          <Server className="size-3.5 shrink-0" aria-hidden />
          Game servers
        </TabsTrigger>
        <TabsTrigger value="backups" className="gap-1.5">
          <Database className="size-3.5 shrink-0" aria-hidden />
          Backups
        </TabsTrigger>
        <TabsTrigger value="tools" className="gap-1.5">
          <Wrench className="size-3.5 shrink-0" aria-hidden />
          {"Tools & access"}
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="overview"
        className={cn("mt-4 border-0 bg-transparent p-0 shadow-none")}
      >
        {overview}
      </TabsContent>
      <TabsContent
        value="servers"
        className="mt-4 border-0 bg-transparent p-0 shadow-none"
      >
        {servers}
      </TabsContent>
      <TabsContent
        value="backups"
        className="mt-4 border-0 bg-transparent p-0 shadow-none"
      >
        {backups}
      </TabsContent>
      <TabsContent
        value="tools"
        className="mt-4 border-0 bg-transparent p-0 shadow-none"
      >
        {tools}
      </TabsContent>
    </Tabs>
  );
}
