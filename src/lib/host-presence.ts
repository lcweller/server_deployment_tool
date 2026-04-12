/**
 * Host "online" in the DB is only flipped true on heartbeat; it never flips false
 * when the machine stops. The dashboard derives reachability from lastSeenAt.
 */

/** Agent heartbeats about every 30s — allow slack for slow ticks and clock skew. */
export const HOST_HEARTBEAT_MAX_AGE_MS = 120_000;

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
