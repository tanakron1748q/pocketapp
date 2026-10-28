import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return ["/dashboard/:path*", "/login"].map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
    }));
  },
};

export default nextConfig;
