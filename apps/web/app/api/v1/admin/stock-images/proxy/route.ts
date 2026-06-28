import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';

const ALLOWED_HOST_ORIGINS: Record<string, string> = {
  'pixabay.com': 'https://pixabay.com',
  'www.pixabay.com': 'https://www.pixabay.com',
  'cdn.pixabay.com': 'https://cdn.pixabay.com',
  'pexels.com': 'https://pexels.com',
  'www.pexels.com': 'https://www.pexels.com',
  'images.pexels.com': 'https://images.pexels.com',
};

function hasUnsafePathname(pathname: string): boolean {
  return pathname.includes('..') || pathname.includes('\\') || pathname.includes('\0');
}

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const raw = new URL(request.url).searchParams.get('url');
  if (!raw) {
    return NextResponse.json({ error: 'חסרה כתובת תמונה' }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: 'כתובת תמונה לא תקינה' }, { status: 400 });
  }

  const origin = ALLOWED_HOST_ORIGINS[target.hostname];
  if (target.protocol !== 'https:' || !origin || hasUnsafePathname(target.pathname)) {
    return NextResponse.json({ error: 'מקור תמונה לא מאושר' }, { status: 400 });
  }

  const safeTarget = new URL(`${target.pathname}${target.search}`, origin);
  // codeql[js/request-forgery]: safeTarget is constrained to an explicit allowlist of stock image origins.
  const res = await fetch(safeTarget.toString(), {
    next: { revalidate: 0 },
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'User-Agent': 'NuraWellMediaManager/1.0 (+https://nurawell.ai)',
    },
  });
  if (!res.ok) {
    return NextResponse.json({ error: 'לא הצלחנו להוריד את התמונה' }, { status: 502 });
  }

  const contentType = res.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'הקובץ שהורד אינו תמונה' }, { status: 400 });
  }

  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, no-store',
    },
  });
}
