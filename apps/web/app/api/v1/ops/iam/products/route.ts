import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadActor, productsFor, selectedProduct } from '@/lib/platform/authorize';
import { ALL_PRODUCTS, decide } from '@platform/iam';
import { CATALOG, DEFAULT_PRODUCT, PRODUCT_COOKIE } from '@/lib/platform/catalog';

export const dynamic = 'force-dynamic';

/** Products the signed-in admin may open (switcher). Server-filtered; the UI never decides access. */
export async function GET(request: Request) {
  const g = await requireApiAdmin(request);
  if (!g.ok) return g.response;
  const { products, founder } = productsFor(await loadActor(createAdminClient(), g.user.id));
  const sel = selectedProduct(request) || DEFAULT_PRODUCT;
  return NextResponse.json({ products: products.map((p) => ({ id: p.id, name: p.name })), founder, selected: sel });
}

/** Select a product; only a permitted product (or "all" for the founder) is accepted. */
export async function POST(request: Request) {
  const g = await requireApiAdmin(request);
  if (!g.ok) return g.response;
  const body = (await request.json().catch(() => null)) as { product?: unknown } | null;
  const product = typeof body?.product === 'string' ? body.product : '';
  const actor = await loadActor(createAdminClient(), g.user.id);
  const { founder } = productsFor(actor);
  const okAll = product === ALL_PRODUCTS && founder;
  if (!okAll && !decide(CATALOG, actor, product, 'admin.access', { steppedUp: true }).allow) {
    return NextResponse.json({ error: 'אין לך גישה למוצר הזה' }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true, selected: product });
  res.cookies.set(PRODUCT_COOKIE, product, { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return res;
}
