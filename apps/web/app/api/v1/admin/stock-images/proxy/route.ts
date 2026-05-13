import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';

export const runtime = 'nodejs';

const ALLOWED_HOSTS = new Set([
  'pixabay.com',
  'cdn.pixabay.com',
  'images.pexels.com',
  'www.pexels.com',
]);

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

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

  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    return NextResponse.json({ error: 'מקור תמונה לא מאושר' }, { status: 400 });
  }

  const res = await fetch(target.toString(), { next: { revalidate: 0 } });
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
