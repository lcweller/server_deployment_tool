import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Slim production images: `node .next/standalone/server.js` */
  output: "standalone",
};

export default nextConfig;
