import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow self-hosted uploads under /public/uploads
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
