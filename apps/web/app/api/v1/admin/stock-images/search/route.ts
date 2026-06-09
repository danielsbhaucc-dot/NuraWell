import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { searchStockImages, stockImageSearchQuerySchema } from '@/lib/media/stock-images';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const url = new URL(request.url);
  const parsed = stockImageSearchQuerySchema.safeParse({
    q: url.searchParams.get('q') ?? '',
    source: url.searchParams.get('source') ?? 'all',
    per_page: url.searchParams.get('per_page') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'שאילתת חיפוש לא תקינה' }, { status: 400 });
  }

  const { q, source, per_page: perPage } = parsed.data;
  try {
    const cachedStockSearch = unstable_cache(
      async () => searchStockImages({ q, source, perPage }),
      ['admin-stock-image-search', q, source, String(perPage)],
      { revalidate: 86400 }
    );
    const { hits, providers } = await cachedStockSearch();

  if (!providers.pixabay && !providers.pexels) {
    return NextResponse.json(
      {
        error: 'חסרים מפתחות API ל-Pixabay או Pexels בשרת.',
        hits: [],
        providers,
      },
      { status: 503 }
    );
  }

    return NextResponse.json(
      { hits, providers },
      {
        headers: {
          'Cache-Control': 'private, max-age=86400',
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'PIXABAY_RATE_LIMIT' || message === 'PEXELS_RATE_LIMIT') {
      return NextResponse.json(
        { error: 'הגעתם למגבלת חיפוש זמנית של ספק התמונות. נסו שוב מאוחר יותר.', hits: [], providers: { pixabay: false, pexels: false } },
        { status: 429 }
      );
    }
    throw error;
  }
}
