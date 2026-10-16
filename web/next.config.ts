import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Notices travel with the server-side card, not only with the source checkout.
  outputFileTracingIncludes: {
    '/api/card': ['./assets/fonts/**/*', './public/fonts/licenses/*.txt'],
  },
};

export default nextConfig;
