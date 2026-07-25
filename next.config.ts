import type { NextConfig } from "next";

import { getBrowserSecurityHeaders } from "./lib/browser-security";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  serverExternalPackages: ["pdf-parse", "tesseract.js"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: getBrowserSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
