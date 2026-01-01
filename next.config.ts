import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
   images: {
    domains: ["coverartarchive.org", "archive.org"],
  },
  reactCompiler: true,
};

export default nextConfig;
