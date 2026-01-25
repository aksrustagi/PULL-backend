/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pull/ui", "@pull/types"],
  experimental: {
    typedRoutes: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.pull.app",
      },
      {
        protocol: "https",
        hostname: "pull.app",
      },
    ],
  },
  async headers() {
    // SECURITY NOTE: 'unsafe-eval' and 'unsafe-inline' in CSP weaken XSS protection
    // TODO: Remove these directives by:
    // 1. Using nonces for legitimate inline scripts
    // 2. Moving inline styles to CSS modules
    // 3. Refactoring any eval() usage
    const isDev = process.env.NODE_ENV === 'development';
    const scriptSrc = isDev 
      ? "'self' 'unsafe-eval' 'unsafe-inline'" 
      : "'self' 'unsafe-inline'"; // Keep unsafe-inline temporarily, remove unsafe-eval in prod
    
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' https://*.pull.app data:; connect-src 'self' https://*.pull.app https://*.convex.cloud wss://*.convex.cloud; font-src 'self'; frame-ancestors 'none';`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
