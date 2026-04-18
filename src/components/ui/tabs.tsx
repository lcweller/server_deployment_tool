"use client";

import { Tabs } from "@base-ui/react/tabs";

import { cn } from "@/lib/utils";

function TabsRoot({ className, ...props }: Tabs.Root.Props) {
  return (
    <Tabs.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: Tabs.List.Props) {
  return (
    <Tabs.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 w-fit items-center justify-start gap-1 rounded-lg border border-border/80 bg-muted/30 p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: Tabs.Tab.Props) {
  return (
    <Tabs.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex min-w-[6rem] items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-active:bg-background data-active:text-foreground data-active:shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: Tabs.Panel.Props) {
  return (
    <Tabs.Panel
      data-slot="tabs-content"
      className={cn(
        "mt-2 min-h-[120px] rounded-lg border border-border/60 bg-card/30 p-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      {...props}
    />
  );
}

export { TabsRoot as Tabs, TabsList, TabsTrigger, TabsContent };
