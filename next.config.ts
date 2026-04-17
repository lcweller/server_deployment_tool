import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Custom `server.ts` attaches the agent WebSocket (`/api/v1/agent/ws`).
   * Use `npm start` (tsx server.ts), not the standalone server bundle.
   */
};

export default nextConfig;
