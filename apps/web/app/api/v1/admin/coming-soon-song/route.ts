import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';

export const runtime = 'nodejs';

const patchSchema = z
  .object({
    song_url: z
      .string()
      .trim()
      .min(8)
      .max(2048)
      .refine((s) => /^https?:\/\//i.test(s), { message: 'כתובת לא תקינה' }),
    song_title: z.string().trim().max(200).optional(),
  })
  .strict();

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('site_settings')
    .select('coming_soon_song_url, coming_soon_song_title, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as
    | { coming_soon_song_url?: string | null; coming_soon_song_title?: string | null; updated_at?: string }
    | null;

  return NextResponse.json({
    song_url: row?.coming_soon_song_url ?? null,
    song_title: row?.coming_soon_song_title ?? null,
    updated_at: row?.updated_at ?? null,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = patchSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתונים לא תקינים', issues: parsed.error.flatten() }, { status: 400 });
  }

  const { supabase } = auth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('site_settings')
    .update({
      coming_soon_song_url: parsed.data.song_url,
      coming_soon_song_title: parsed.data.song_title ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select('coming_soon_song_url, coming_soon_song_title, updated_at')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const row = data as
    | { coming_soon_song_url?: string | null; coming_soon_song_title?: string | null; updated_at?: string }
    | null;

  return NextResponse.json({
    ok: true,
    song_url: row?.coming_soon_song_url ?? null,
    song_title: row?.coming_soon_song_title ?? null,
    updated_at: row?.updated_at ?? null,
  });
}

export async function DELETE(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('site_settings')
    .update({
      coming_soon_song_url: null,
      coming_soon_song_title: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
