import type { MetadataRoute } from 'next';

/**
 * Sitemap ציבורי בלבד — ללא /guides/* (דורשים התחברות) וללא /login.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'https://nurawell.co.il';

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/register`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    ...(['/about', '/contact', '/terms', '/privacy', '/safety', '/accessibility'] as const).map(
      (path) => ({
        url: `${baseUrl}${path}`,
        lastModified: new Date(),
        changeFrequency: 'yearly' as const,
        priority: path === '/about' || path === '/contact' ? 0.5 : 0.3,
      }),
    ),
  ];
}
