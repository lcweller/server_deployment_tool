import { HOSTED_DASHBOARD_PUBLIC_URL } from "@/lib/hosted-dashboard-url";

/**
 * Canonical public dashboard URL (runtime env). Used for email links, redirects, and agent install commands.
 * Set `APP_PUBLIC_URL` in production (`HOSTED_DASHBOARD_PUBLIC_URL` for Layer One) — no trailing slash.
 */
export function publicAppUrl(): string {
  const raw =
    typeof process !== "undefined"
      ? process.env["APP_PUBLIC_URL"]?.trim() ||
        process.env["NEXT_PUBLIC_APP_URL"]?.trim()
      : "";
  if (raw) {
    return raw.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    console.warn(
      `[steamline] APP_PUBLIC_URL is not set — using http://localhost:3000. Set APP_PUBLIC_URL to your public https URL (e.g. ${HOSTED_DASHBOARD_PUBLIC_URL} in the Steamline container env).`
    );
  }
  return "http://localhost:3000";
}
