import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { opsCanonicalHostname, requestHostname } from '@/lib/ops-host';

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Ops/admin host: block every crawler and never advertise the public sitemap there.
  const host = requestHostname((await headers()).get('host'));
  const ops = opsCanonicalHostname();
  if (ops && host === ops) return { rules: [{ userAgent: '*', disallow: '/' }] };

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
