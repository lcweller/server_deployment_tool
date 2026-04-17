"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useHostRealtimeEvents } from "@/lib/realtime/use-host-realtime-events";

const TAB_REFRESH_AFTER_HIDDEN_MS = 3000;

/**
 * Subscribes to SSE `/api/realtime/events` so server-rendered data refreshes on host updates.
 * Reconnects with backoff after connection loss; refreshes when the tab was backgrounded long enough.
 */
export function RealtimeDashboardRefresh() {
  const router = useRouter();
  useHostRealtimeEvents(() => {
    router.refresh();
  });

  useEffect(() => {
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (
        hiddenAt > 0 &&
        Date.now() - hiddenAt >= TAB_REFRESH_AFTER_HIDDEN_MS
      ) {
        router.refresh();
      }
      hiddenAt = 0;
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}
