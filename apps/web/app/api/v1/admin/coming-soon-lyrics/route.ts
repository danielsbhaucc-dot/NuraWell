import { NextResponse } from 'next/server';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { comingSoonLyricsSchema, DEFAULT_LYRICS, parseLyricsConfig } from '@/lib/coming-soon/lyrics';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('site_settings')
    .select('coming_soon_lyrics')
    .eq('id', 1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stored = parseLyricsConfig(data?.coming_soon_lyrics);
  return NextResponse.json({
    lyrics: stored ?? DEFAULT_LYRICS,
    is_custom: stored !== null,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const body = (raw.value ?? {}) as { lyrics?: unknown };
  const parsed = comingSoonLyricsSchema.safeParse(body.lyrics);
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתוני תזמון לא תקינים', issues: parsed.error.flatten() }, { status: 400 });
  }

  const { supabase } = auth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('site_settings')
    .update({ coming_soon_lyrics: parsed.data, updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lyrics: parsed.data });
}

export async function DELETE(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('site_settings')
    .update({ coming_soon_lyrics: null, updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lyrics: DEFAULT_LYRICS });
}
