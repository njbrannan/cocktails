import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
