/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Native / heavy deps must not be bundled into Route Handlers (avoids 503 on Vercel). */
  serverExternalPackages: ['@aws-sdk/client-s3', 'web-push'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    /** עד חיבור דומיין קבוע — Vercel; אפשר לעקוף ב־Dashboard או בפאנל (site_settings) */
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL || 'https://nurawell.vercel.app',
    NEXT_PUBLIC_OPS_HOSTNAME: process.env.NEXT_PUBLIC_OPS_HOSTNAME || '',
    NEXT_PUBLIC_OPS_URL: process.env.NEXT_PUBLIC_OPS_URL || '',
    NEXT_PUBLIC_AUTH_COOKIE_DOMAIN: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN || '',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    NEXT_PUBLIC_BUNNY_PULL_ORIGIN:
      process.env.NEXT_PUBLIC_BUNNY_PULL_ORIGIN || 'https://video.nurawell.ai',
    NEXT_PUBLIC_BUNNY_STREAM_LIBRARY_ID:
      process.env.NEXT_PUBLIC_BUNNY_STREAM_LIBRARY_ID || '654032',
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    /** פחות קוד בבנדל — איקונים ואנימציות נטענים פר-סמל/פר קומפוננטה */
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'uploadthing.com' },
      { protocol: 'https', hostname: '*.uploadthing.com' },
      { protocol: 'https', hostname: '*.utfs.io' },
      { protocol: 'https', hostname: '*.bunnycdn.com' },
      { protocol: 'https', hostname: '*.b-cdn.net' },
      { protocol: 'https', hostname: 'video.nurawell.ai' },
      { protocol: 'https', hostname: 'img.youtube.com' },
      { protocol: 'https', hostname: 'i.vimeocdn.com' },
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: 'cdn.nurawell.ai' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
      {
        /** Same-origin fetch לא צריך CORS; שילוב קודם של credentials + * היה לא תקין ומיותר */
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,DELETE,OPTIONS' },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
