import { NextResponse } from 'next/server';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import {
  comingSoonRevolutionLinesSchema,
  DEFAULT_REVOLUTION_LINES,
  parseRevolutionLines,
} from '@/lib/coming-soon/revolution-lines';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('site_settings')
    .select('coming_soon_revolution_lines')
    .eq('id', 1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stored = parseRevolutionLines(data?.coming_soon_revolution_lines);
  return NextResponse.json({
    lines: stored ?? DEFAULT_REVOLUTION_LINES,
    is_custom: stored !== null,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const body = (raw.value ?? {}) as { lines?: unknown };
  const parsed = comingSoonRevolutionLinesSchema.safeParse(body.lines);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'רשימת משפטים לא תקינה', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { supabase } = auth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('site_settings')
    .update({
      coming_soon_revolution_lines: parsed.data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lines: parsed.data });
}

export async function DELETE(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('site_settings')
    .update({
      coming_soon_revolution_lines: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lines: DEFAULT_REVOLUTION_LINES });
}
