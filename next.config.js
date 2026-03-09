/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only enable static export when explicitly requested (e.g. `STATIC_EXPORT=true npm run build`)
  // Vercel deployments need server-side API routes, so we skip this there.
  ...(process.env.STATIC_EXPORT === "true" && {
    output: "export",
    trailingSlash: true,
  }),

  // Disable image optimization for static export (Next.js requirement)
  images: {
    unoptimized: true,
  },

  // Optional: Set base path for deployment in subdirectories
  // Uncomment and modify if you need to deploy to a subdirectory like /figma-clone
  // basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',

  // Optional: Set asset prefix for CDN deployment
  // assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || '',

  // Playwright + Stagehand use native Node.js modules that can't be bundled.
  // Mark them as server-external so Next.js loads them at runtime.
  serverExternalPackages: [
    "@browserbasehq/stagehand",
    "playwright",
    "playwright-core",
  ],
};

module.exports = nextConfig;
