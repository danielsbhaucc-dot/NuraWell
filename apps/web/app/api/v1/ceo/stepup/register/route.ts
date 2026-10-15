import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { registerPasskey } from '@/lib/ceo/security';
import { alertOwner, limitIp, noStore } from '@/lib/ceo/stepup-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const b = z.string().regex(/^[A-Za-z0-9_-]+$/).max(4096);
const Body = z.object({ t: b, credentialId: b, clientDataJSON: b, authenticatorData: b, publicKey: b, alg: z.number().int(), label: z.string().max(60).optional() });

export async function POST(request: Request) {
  const limited = await limitIp(request, 'ceo-stepup-reg', 10);
  if (limited) return limited;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400, ...noStore });
  const { t, ...rest } = p.data;
  const r = await registerPasskey(createAdminClient(), t, rest);
  if (r.ok) await alertOwner(`🔐 נרשם מפתח Face ID חדש לגדעון${rest.label ? ` (${rest.label})` : ''}. אם זה לא אתה, כבה את גדעון מ-Ops מיד.`);
  return NextResponse.json(r, { status: r.ok ? 200 : 400, ...noStore });
}
