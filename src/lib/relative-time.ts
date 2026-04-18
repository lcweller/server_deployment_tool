/**
 * Human-readable relative time for activity feeds (no date-fns dependency).
 */
export function formatRelativeTime(date: Date | string): string {
  const t =
    typeof date === "string" ? new Date(date).getTime() : date.getTime();
  if (Number.isNaN(t)) return "—";
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 45) return "just now";
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const d = Math.floor(sec / 86400);
  if (d < 14) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
