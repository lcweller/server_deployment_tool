"use client";

import { Toaster as Sonner } from "sonner";

/**
 * Bottom-right toasts (5s default). Mount once in the root layout.
 * Dashboard is dark-first; Sonner uses dark styling.
 */
export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      closeButton
      duration={5000}
      toastOptions={{
        classNames: {
          toast:
            "group toast border border-border bg-popover text-popover-foreground shadow-lg",
          title: "text-sm font-semibold text-foreground",
          description: "text-xs text-muted-foreground",
          actionButton: "text-primary",
          cancelButton: "text-muted-foreground",
          closeButton:
            "text-muted-foreground hover:text-foreground border-0 bg-transparent",
        },
      }}
    />
  );
}
