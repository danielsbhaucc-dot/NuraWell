/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Native / heavy deps must not be bundled into Route Handlers (avoids 503 on Vercel). */
  serverExternalPackages: ['@aws-sdk/client-s3', 'web-push', 'sharp'],
  /**
   * אכיפת TypeScript ב-build — חובה לאבטחה.
   * ignoreBuildErrors:true מסיר את שכבת ההגנה של TypeScript ומאפשר לקוד לא-בטוח
   * (עם `as any`, טיפוסים שגויים, null-safety bypass) להגיע לפרודקשן.
   * אם יש שגיאות טיפוס — יש לתקן אותן, לא לעקוף.
   */
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    /**
     * ESLint ב-build — מופעל. איסור ignoreDuringBuilds כדי לא לפספס
     * בעיות אבטחה (no-eval, no-implied-eval, no-secrets) ב-production.
     */
    ignoreDuringBuilds: false,
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
  async redirects() {
    return [
      { source: '/courses', destination: '/guides', permanent: true },
      { source: '/courses/:id', destination: '/guides/:id', permanent: true },
    ];
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
          // ── Content-Security-Policy ──────────────────────────────
          // מוגדר ב-middleware.ts עם nonce אקראי לכל request,
          // במקום 'unsafe-inline'. Next.js App Router קורא אוטומטית
          // את ה-header x-nonce ומשתמש בו ב-inline scripts.
          // ראה: middleware.ts -> CSP_DIRECTIVES
          // CSP header מוחל ב-middleware עבור כל ה-HTML pages,
          // API routes, ו-redirects.
          // HEADER זה מוסר מ-next.config כי middleware גובר.
          // ── Strict-Transport-Security (HSTS) ────────────────────
          // מחייב HTTPS למשך שנה, כולל תתי-דומיינים.
          // מופעל רק ב-production (ב-dev localhost עובד HTTP).
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
        ],
      },
      {
        /**
         * CORS ל-API routes — עם אימות Origin למניעת CSRF מצלב-דומיינים.
         * הערה: Next.js Route Handlers לא צריכים CORS בדרך כלל (same-origin),
         * אבל אנחנו משאירים תמיכה לאפליקציית מובייל עתידית / scripts.
         * Origin מאומת מול הדומיינים המורשים (app + ops).
         */
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,DELETE,OPTIONS' },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
          },
          // Access-Control-Allow-Origin נקבע דינמית לפי ה-request origin
          // ב-middlware או ב-route handlers עצמם (לא סטטי ב-next.config)
        ],
      },
    ];
  },
};

module.exports = nextConfig;
