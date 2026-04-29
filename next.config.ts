import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Avoid Next guessing the parent folder as the app root when another
    // package-lock exists above this project on Nathan's laptop.
    root: process.cwd(),
  },
  async redirects() {
    return [
      {
        // Keep old links working, but avoid SEO issues by making `/` the canonical entry.
        // IMPORTANT: do NOT redirect `/request/order` etc.
        source: "/request",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
