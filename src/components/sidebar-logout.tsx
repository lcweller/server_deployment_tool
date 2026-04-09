"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { SidebarMenuItem } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function SidebarLogout() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onLogout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <SidebarMenuItem>
      <button
        type="button"
        onClick={onLogout}
        disabled={pending}
        className={cn(
          "flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/90 outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 disabled:opacity-50"
        )}
      >
        <LogOut className="size-4 shrink-0 opacity-90" aria-hidden />
        <span className="truncate group-data-[collapsible=icon]:hidden">
          {pending ? "Signing out…" : "Log out"}
        </span>
      </button>
    </SidebarMenuItem>
  );
}
