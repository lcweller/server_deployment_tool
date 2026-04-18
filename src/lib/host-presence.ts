/**
 * Host "online" in the DB is only flipped true on heartbeat; it never flips false
 * when the machine stops. The dashboard derives reachability from lastSeenAt.
 */

/**
 * How old `lastSeenAt` may be before the UI treats the host as unreachable.
 *
 * The agent normally heartbeats over WebSocket every ~2.5s. If WebSocket is blocked
 * or `STEAMLINE_DISABLE_AGENT_WS=1`, it falls back to REST on an interval that defaults
 * to **30s** (`steamline-agent run --interval`). A 6s window falsely showed those hosts
 * as offline between every REST heartbeat — use a window that covers REST + jitter.
 */
export const HOST_HEARTBEAT_MAX_AGE_MS = 65_000;

export function isHostHeartbeatFresh(
  lastSeenAt: Date | string | null | undefined
): boolean {
  if (lastSeenAt == null) {
    return false;
  }
  const t =
    typeof lastSeenAt === "string"
      ? new Date(lastSeenAt).getTime()
      : lastSeenAt.getTime();
  if (Number.isNaN(t)) {
    return false;
  }
  return Date.now() - t < HOST_HEARTBEAT_MAX_AGE_MS;
}

export type HostPresenceRow = {
  status: string;
  lastSeenAt: Date | null;
};

/**
 * Status shown in the UI and API: a stale heartbeat overrides DB `online` → `offline`.
 */
export function effectiveHostStatus(row: HostPresenceRow): string {
  if (row.status === "pending") {
    return "pending";
  }
  if (row.status === "pending_removal") {
    return "pending_removal";
  }
  if (!isHostHeartbeatFresh(row.lastSeenAt)) {
    return "offline";
  }
  return "online";
}
