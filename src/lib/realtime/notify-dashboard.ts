import "server-only";

import { publishHostRealtime } from "@/lib/realtime/host-updates";

/**
 * Sentinel `hostId` when only the user id is known (SSE clients still full-refresh).
 * Avoid using for host-scoped pages when a real host id is available.
 */
const USER_LEVEL_REFRESH_HOST_ID = "00000000-0000-0000-0000-000000000001";

/** After mutating a host's instances or host row — subscribed dashboards refresh via SSE. */
export function notifyHostOwnerDashboard(
  userId: string,
  hostId: string
): void {
  publishHostRealtime(userId, { hostId, kind: "instances" });
}

/** Instance list / draft changes where `hostId` may be null (e.g. row removed). */
export function notifyUserServersRealtime(userId: string): void {
  publishHostRealtime(userId, {
    hostId: USER_LEVEL_REFRESH_HOST_ID,
    kind: "instances",
  });
}
