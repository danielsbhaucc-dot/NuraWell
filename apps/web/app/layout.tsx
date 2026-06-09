import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';

/** Same-origin metadata (manifest, OG URLs) — avoids manifest fetch getting HTML from the wrong host on Vercel. */
function metadataBaseUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) {
    try {
      return new URL(explicit.endsWith('/') ? explicit : `${explicit}/`);
    } catch {
      /* fall through */
    }
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const origin = vercel.startsWith('http') ? vercel : `https://${vercel}`;
    try {
      return new URL(origin.endsWith('/') ? origin : `${origin}/`);
    } catch {
      /* fall through */
    }
  }
  return new URL('https://nurawell.co.il/');
}

export const metadata: Metadata = {
  title: {
    default: 'NuraWell | הדרך החכמה לחיים בריאים',
    template: '%s | NuraWell',
  },
  description:
    'NuraWell — מערכת פרימיום לשינוי אורח חיים. מסע מובנה, קורסים, מנטור AI אישי והרגלים יומיים. בלי דיאטה, בלי ספירת קלוריות, בלי הרעבה.',
  keywords: [
    'NuraWell',
    'אורח חיים בריא',
    'קורסים אונליין',
    'AI',
    'בריאות',
    'הרגלים',
    'מנטור אישי',
    'מסע אישי',
  ],
  authors: [{ name: 'NuraWell' }],
  creator: 'NuraWell',
  publisher: 'NuraWell',
  metadataBase: metadataBaseUrl(),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'NuraWell | הדרך החכמה לחיים בריאים',
    description: 'מסע מובנה, קורסים ומנטור AI — ליווי אישי לשינוי אורח חיים בלי דיאטה',
    type: 'website',
    locale: 'he_IL',
    siteName: 'NuraWell',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'NuraWell — הדרך החכמה לחיים בריאים' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NuraWell | הדרך החכמה לחיים בריאים',
    description: 'מסע מובנה, קורסים ומנטור AI — ליווי אישי לשינוי אורח חיים',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#14b8a6' },
    { media: '(prefers-color-scheme: dark)', color: '#0f766e' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const siteOrigin = metadataBaseUrl().origin;
  return (
    <html lang="he" dir="rtl" translate="no" className="notranslate" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&family=Rubik:wght@400;500;600;700;800;900&family=Cormorant+Garamond:wght@300;600&family=DM+Sans:wght@300&display=swap"
          rel="stylesheet"
        />
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'NuraWell',
              url: siteOrigin,
              description: 'מערכת פרימיום לשינוי אורח חיים עם מנטור AI',
              inLanguage: 'he',
            }),
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased notranslate">
        <a
          href="#main-content"
          className="absolute start-[-10000px] top-auto z-[100] overflow-hidden focus:fixed focus:start-4 focus:top-16 focus:h-auto focus:w-auto focus:overflow-visible focus:rounded-xl focus:bg-teal-600 focus:px-4 focus:py-3 focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
        >
          דלג לתוכן הראשי
        </a>
        {children}
      </body>
    </html>
  );
}
