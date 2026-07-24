import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    config.module.rules.push({
      resourceQuery: /raw/,
      test: /\.(?:html|md)$/,
      type: "asset/source",
    });

    return config;
  },
};

export default nextConfig;
