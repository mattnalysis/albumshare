import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "coverartarchive.org",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "archive.org",
        pathname: "/**",
      }
      // add others only if you actually use them:
      // { protocol: "https", hostname: "i.scdn.co", pathname: "/**" },
    ],
  },
};

export default nextConfig;

