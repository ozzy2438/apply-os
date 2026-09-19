import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "postgres", "@typesafe-ai/sdk", "playwright"],
};

export default nextConfig;
