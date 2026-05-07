import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://nurawell.co.il';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/profile', '/progress', '/lessons/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
