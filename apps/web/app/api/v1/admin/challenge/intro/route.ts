import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { parseChallengeIntroLines } from '@/lib/challenge/content';
import { syncChallengeIntroTts } from '@/lib/tts/sync-challenge-intro-tts';
import { logChallengeAdminAudit } from '@/lib/challenge/admin-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { data } = await auth.supabase
    .from('site_settings')
    .select('challenge_intro_lines, challenge_intro_tts_url, challenge_intro_tts_text')
    .eq('id', 1)
    .maybeSingle();

  return NextResponse.json({
    lines: parseChallengeIntroLines(data?.challenge_intro_lines),
    tts_url: data?.challenge_intro_tts_url ?? null,
    tts_text: data?.challenge_intro_tts_text ?? null,
  });
}

const patchSchema = z.object({
  lines: z
    .array(
      z.object({
        text: z.string().min(1).max(500),
        emphasis: z.boolean().optional(),
      }),
    )
    .optional(),
  sync_tts: z.boolean().optional(),
  tts_text: z.string().min(1).max(8000).optional(),
});

export async function PATCH(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = patchSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (parsed.data.lines) {
    update.challenge_intro_lines = parsed.data.lines;
  }

  if (parsed.data.sync_tts && parsed.data.tts_text) {
    const result = await syncChallengeIntroTts(parsed.data.tts_text);
    if (!result.url) {
      return NextResponse.json({ error: result.error ?? 'TTS failed' }, { status: 500 });
    }
    update.challenge_intro_tts_url = result.url;
    update.challenge_intro_tts_text = parsed.data.tts_text;
  }

  await auth.supabase.from('site_settings').update(update).eq('id', 1);

  await logChallengeAdminAudit(auth.supabase, auth.user.id, {
    action: parsed.data.sync_tts ? 'intro.sync_tts' : 'intro.patch',
    entity_type: 'intro',
    summary: parsed.data.sync_tts ? 'סנכרון TTS לפתיחת אתגר' : 'עדכון שורות פתיחה',
    payload: {
      lines_count: parsed.data.lines?.length ?? 0,
      sync_tts: Boolean(parsed.data.sync_tts),
    },
  });

  return NextResponse.json({ ok: true, tts_url: update.challenge_intro_tts_url ?? null });
}
