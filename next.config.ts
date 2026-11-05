import type { NextConfig } from "next";

// Extract the staging Supabase host from NEXT_PUBLIC_SUPABASE_URL for CSP.
// Production CSP remains restrictive (scoped to *.supabase.co / *.supabase.in).
// Staging host is added explicitly when NEXT_PUBLIC_SUPABASE_URL points to a
// non-production Supabase project. No unrestricted wildcards are used for staging.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const stagingSupabaseHost = supabaseUrl
  ? (() => {
      try {
        return new URL(supabaseUrl).hostname;
      } catch {
        return null;
      }
    })()
  : null;

const stagingCspHosts = stagingSupabaseHost
  ? [`https://${stagingSupabaseHost}`, `wss://${stagingSupabaseHost}`]
  : [];

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in${stagingCspHosts.length ? ` https://${stagingCspHosts[0].replace('https://', '')}` : ''}`,
      "font-src 'self' data:",
      `connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in${stagingCspHosts.length ? ` ${stagingCspHosts.join(' ')}` : ''}`,
      "media-src 'self' https://*.supabase.co https://*.supabase.in blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/settings/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, no-cache, must-revalidate",
          },
        ],
      },
      {
        source: "/messages/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, no-cache, must-revalidate",
          },
        ],
      },
      {
        source: "/notifications/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, no-cache, must-revalidate",
          },
        ],
      },
      {
        source: "/bookmarks/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, no-cache, must-revalidate",
          },
        ],
      },
      {
        source: "/account-security/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, no-cache, must-revalidate",
          },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
