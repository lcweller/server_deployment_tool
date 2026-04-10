"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Periodically refreshes server components so host heartbeat / metrics stay current.
 */
export function DashboardPoller({ intervalMs = 8000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
