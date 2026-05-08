/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Native / heavy deps must not be bundled into Route Handlers (avoids 503 on Vercel). */
  serverExternalPackages: ['@aws-sdk/client-s3'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
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
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
