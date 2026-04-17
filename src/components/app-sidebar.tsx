"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  Server,
  Settings2,
  Cpu,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notification-bell";
import { SidebarLogout } from "@/components/sidebar-logout";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const nav = [
  { title: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { title: "Game catalog", href: "/catalog", icon: BookOpen },
  { title: "Hosts", href: "/hosts", icon: Cpu },
  { title: "Servers", href: "/servers", icon: Server },
  { title: "Billing", href: "/billing", icon: CreditCard },
  { title: "Settings", href: "/settings", icon: Settings2 },
  { title: "Alert settings", href: "/settings/notifications", icon: Bell },
] as const;

function NavLinks() {
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {nav.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <SidebarMenuItem key={item.href}>
            <Link
              href={item.href}
              className={cn(
                "flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-sm outline-none ring-sidebar-ring transition-colors focus-visible:ring-2",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="size-4 shrink-0 opacity-90" aria-hidden />
              <span className="truncate">{item.title}</span>
            </Link>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

type AppSidebarProps = {
  userEmail: string;
};

export function AppSidebar({ userEmail }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="border-b border-sidebar-border/60 pb-3">
        <div className="flex items-center gap-1">
          <Link
            href="/dashboard"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 outline-none ring-sidebar-ring focus-visible:ring-2"
          >
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground"
              aria-hidden
            >
              S
            </span>
            <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-semibold tracking-tight">
                Steamline
              </span>
              <span className="truncate text-xs text-sidebar-foreground/65">
                Game servers
              </span>
            </div>
          </Link>
          <div className="shrink-0 group-data-[collapsible=icon]:hidden">
            <NotificationBell />
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-sidebar-foreground/55">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <NavLinks />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/60">
        <p className="mb-1 truncate px-2 text-xs text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden">
          {userEmail}
        </p>
        <SidebarMenu>
          <SidebarLogout />
          <SidebarMenuItem>
            <Link
              href="/docs/getting-started"
              className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LifeBuoy className="size-4 shrink-0" aria-hidden />
              <span className="truncate group-data-[collapsible=icon]:hidden">
                Help & docs
              </span>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
