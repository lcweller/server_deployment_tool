import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Custom `server.ts` attaches the agent WebSocket (`/api/v1/agent/ws`).
   * Use `npm start` (tsx server.ts), not the standalone server bundle.
   */
  /**
   * Dev-only: `/_next/*` and HMR WebSockets require an allowlisted Origin host.
   * Browsing via `http://127.0.0.1` (common for Playwright and some setups) is
   * otherwise treated as cross-site and the upgrade returns a non-101 response.
   */
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
