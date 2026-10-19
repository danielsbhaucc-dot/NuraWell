import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/ceo/actions';
import { deletePref, describePref, listPrefs, OpsShabbatInput, PrefInput, saveOpsShabbat, savePref, setPrefActive } from '@/lib/ceo/prefs';
import { holyWindows, quietState, shabbatParams } from '@/lib/ceo/quiet';
import { flushOutbox } from '@/lib/ceo/outbound';
import { createTelegramChannel } from '@/lib/ceo/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { headers: { 'Cache-Control': 'no-store' } };

/** Admin-only: Daniel's standing instructions for Gideon + messages held during quiet time. */
export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const db = createAdminClient();
  const [all, held] = await Promise.all([
    listPrefs(db, { includeInactive: true }),
    db.from('gideon_outbox').select('id, kind, topic, text, reason, deliver_after, created_at').order('created_at').limit(50),
  ]);
  const now = new Date();
  const active = all.filter((p) => p.active && (!p.expires_at || Date.parse(p.expires_at) > now.getTime()));
  const q = quietState(active, now);
  const sh = all.find((p) => p.kind === 'shabbat');
  const next = holyWindows(now, new Date(now.getTime() + 35 * 86_400_000), shabbatParams(sh?.params)).slice(0, 4);
  return NextResponse.json(
    {
      prefs: all.map((p) => ({ ...p, description: describePref(p, now) })),
      quiet: q.quiet ? { until: q.until.toISOString(), reasons: q.reasons, emergencies: q.emergencies } : null,
      nextWindows: next.map((w) => ({ start: w.start.toISOString(), end: w.end.toISOString(), reason: w.reason })),
      held: (held.data ?? []).map((r: Record<string, unknown>) => ({ ...r, text: String(r.text ?? '').slice(0, 140) })),
    },
    noStore,
  );
}

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save_shabbat'), shabbat: OpsShabbatInput }),
  z.object({ action: z.literal('add'), pref: PrefInput, emergencies: z.enum(['hold', 'allow']).default('hold') }),
  z.object({ action: z.literal('set_active'), id: z.string().uuid(), active: z.boolean() }),
  z.object({ action: z.literal('delete'), id: z.string().uuid() }),
  z.object({ action: z.literal('flush_now') }),
  z.object({ action: z.literal('drop_held') }),
]);

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const p = Body.safeParse(raw.value);
  if (!p.success) return NextResponse.json({ error: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 400 });
  const db = createAdminClient();
  const actor = `admin:${auth.user.id}`;
  const b = p.data;
  try {
    let out: Record<string, unknown> = { ok: true };
    if (b.action === 'save_shabbat') {
      out.pref = await saveOpsShabbat(db, b.shabbat);
    } else if (b.action === 'add') {
      if (b.pref.kind === 'shabbat') return NextResponse.json({ error: 'לשבת יש הגדרה ייעודית' }, { status: 400 });
      out.pref = await savePref(db, b.pref, 'ops', new Date(), { emergencies: b.emergencies });
    } else if (b.action === 'set_active') {
      out.pref = await setPrefActive(db, b.id, b.active);
    } else if (b.action === 'delete') {
      await deletePref(db, b.id);
    } else if (b.action === 'flush_now') {
      const ch = createTelegramChannel();
      out = { ok: true, ...(await flushOutbox(db, (c, t, bt) => ch.send(c, t, bt, { kind: 'outbox' }), { force: true })) };
    } else if (b.action === 'drop_held') {
      const { error } = await db.from('gideon_outbox').delete().gte('id', 0);
      if (error) throw new Error(error.message);
    }
    await audit(db, actor, 'owner_prefs', { action: b.action, ...('id' in b ? { id: b.id } : {}), ...(b.action === 'add' ? { kind: b.pref.kind } : {}) }).catch(() => {});
    return NextResponse.json(out, noStore);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'הפעולה נכשלה' }, { status: 400 });
  }
}
