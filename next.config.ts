import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "postgres", "@typesafe-ai/sdk"],
};

export default nextConfig;
