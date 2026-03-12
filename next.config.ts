import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['imapflow', 'bcryptjs'],
};

export default nextConfig;
