import { NextResponse } from 'next/server';
import { marked } from 'marked';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { SECURITY_DOCS } from '@/lib/legal/security-docs.generated';
import { sanitizeLessonHtml } from '@/lib/sanitize-lesson-html';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ops → משפטי → אבטחה ופרטיות: the security & privacy file (docs/security), read-only, admins only. */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const docs = SECURITY_DOCS.map((d) => ({
    slug: d.slug,
    title: d.title,
    html: sanitizeLessonHtml(marked.parse(d.markdown, { async: false, gfm: true }) as string),
  }));
  return NextResponse.json({ docs }, { headers: { 'Cache-Control': 'no-store' } });
}
