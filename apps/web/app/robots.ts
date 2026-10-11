import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'https://nurawell.co.il';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin', '/profile', '/progress', '/lessons/', '/_next/image'],
      },
      {
        // cost: AI-training/SEO scrapers that crawl heavily and bring no users.
        userAgent: ['GPTBot', 'CCBot', 'ClaudeBot', 'anthropic-ai', 'Bytespider', 'Amazonbot', 'meta-externalagent', 'AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'PetalBot', 'DataForSeoBot'],
        disallow: '/',
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
