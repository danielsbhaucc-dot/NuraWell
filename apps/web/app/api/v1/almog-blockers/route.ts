import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiSession } from '../../../../lib/api/route-guards';
import { createAdminClient } from '../../../../lib/supabase/admin';
import {
  defaultInterventionReminderIso,
  fetchInterventionMemory,
  generateBlockerOptions,
} from '../../../../lib/ai/almog-commitments/intervention-engine';
import { normalizeFrictionCategory, normalizeStrategyType } from '../../../../lib/ai/almog-commitments/friction';
import type { BlockerHistoryEntry, BlockerOption } from '../../../../lib/ai/almog-commitments/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('generate_options'),
    blocker_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('pick'),
    blocker_id: z.string().uuid(),
    option_id: z.enum(['A', 'B']),
  }),
  z.object({
    action: z.literal('not_helped'),
    blocker_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('helped'),
    blocker_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('resolve'),
    blocker_id: z.string().uuid(),
  }),
]);

type BlockerRow = {
  id: string;
  user_id: string;
  description: string;
  strategy: string | null;
  category: string | null;
  attempt_count: number;
  current_options: BlockerOption[] | null;
  status: string;
  history: BlockerHistoryEntry[] | null;
  related_assignment_id: string | null;
};

function dedupeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

async function loadBlocker(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  blockerId: string
): Promise<BlockerRow | null> {
  const { data } = await admin
    .from('almog_blockers')
    .select(
      'id, user_id, description, strategy, category, attempt_count, current_options, status, history, related_assignment_id'
    )
    .eq('id', blockerId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as BlockerRow | null) ?? null;
}

async function getPendingIntervention(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  blockerId: string
) {
  const { data } = await admin
    .from('almog_interventions')
    .select('id, strategy, strategy_type, outcome')
    .eq('user_id', userId)
    .eq('blocker_id', blockerId)
    .eq('outcome', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; strategy: string; strategy_type: string; outcome: string } | null;
}

async function getFailedStrategyTypes(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  blockerId: string
) {
  const { data } = await admin
    .from('almog_interventions')
    .select('strategy_type')
    .eq('user_id', userId)
    .eq('blocker_id', blockerId)
    .eq('outcome', 'not_helped');
  return ((data ?? []) as { strategy_type: string }[]).map((r) =>
    normalizeStrategyType(r.strategy_type)
  );
}

/** משימות פעילות מקוריות שאפשר לקשר אליהן (לא צעדים שנוצרו מחסמים). */
async function getLinkableActiveTasks(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<{ id: string; title: string }[]> {
  const { data } = await admin
    .from('almog_assignments')
    .select('id, title, relation')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('given_at', { ascending: false })
    .limit(8);
  return ((data ?? []) as { id: string; title: string; relation: string | null }[])
    // לא מקשרים צעד-עזר לצעד-עזר אחר — רק למשימות עצמאיות/מקוריות.
    .filter((a) => !a.relation || a.relation === 'standalone')
    .slice(0, 6)
    .map((a) => ({ id: a.id, title: a.title }));
}

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const now = new Date();
  const data = parsed.data;

  const blocker = await loadBlocker(admin, user.id, data.blocker_id);
  if (!blocker) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const history = Array.isArray(blocker.history) ? blocker.history : [];

  // ── generate_options ───────────────────────────────────────────
  if (data.action === 'generate_options') {
    const existingOptions = Array.isArray(blocker.current_options) ? blocker.current_options : [];
    if (existingOptions.length >= 2) {
      return NextResponse.json({
        ok: true,
        cached: true,
        category: normalizeFrictionCategory(blocker.category),
        options: existingOptions.slice(0, 2),
      });
    }

    const memory = await fetchInterventionMemory(admin, user.id);
    const failedTypes = await getFailedStrategyTypes(admin, user.id, blocker.id);
    const linkable = await getLinkableActiveTasks(admin, user.id);
    const taskByRef = new Map(linkable.map((t, i) => [`T${i + 1}`, t.id]));
    const activeTasks = linkable.map((t, i) => ({ ref: `T${i + 1}`, title: t.title }));

    const generated = await generateBlockerOptions({
      description: blocker.description,
      category: blocker.category,
      currentStrategy: blocker.strategy,
      attemptCount: blocker.attempt_count ?? 0,
      memory,
      activeTasks,
      failedStrategyTypes: failedTypes,
    });

    const relatedId = generated.relatesToRef ? taskByRef.get(generated.relatesToRef) ?? null : null;

    await admin
      .from('almog_blockers')
      .update({
        category: generated.category,
        current_options: generated.options,
        ...(relatedId ? { related_assignment_id: relatedId } : {}),
      })
      .eq('id', blocker.id)
      .eq('user_id', user.id);

    return NextResponse.json({
      ok: true,
      category: generated.category,
      options: generated.options,
    });
  }

  // ── pick (החוזה — יוצר צעד + intervention + תזכורת) ───────────
  if (data.action === 'pick') {
    const options = Array.isArray(blocker.current_options) ? blocker.current_options : [];
    const picked = options.find((o) => o.id === data.option_id);
    if (!picked) {
      return NextResponse.json({ error: 'Option not found — generate options first' }, { status: 400 });
    }

    const category = normalizeFrictionCategory(blocker.category);
    const taskKey = dedupeKey(`blk|${blocker.id}|${picked.micro_step}`);

    // יחס למשימה המקורית: relation תקף רק אם החסם קשור למשימה.
    const originalId = blocker.related_assignment_id;
    const relation = originalId ? picked.relation : 'standalone';

    // יצירת הצעד — select-first ואז insert (האינדקס הייחודי חלקי, אז אי-אפשר
    // להשתמש ב-ON CONFLICT/upsert). אם הצעד כבר קיים (בחירה חוזרת) — מפעילים מחדש.
    let assignmentId: string;
    const { data: existingAssign } = await admin
      .from('almog_assignments')
      .select('id')
      .eq('user_id', user.id)
      .eq('dedupe_key', taskKey)
      .maybeSingle();

    if (existingAssign) {
      assignmentId = (existingAssign as { id: string }).id;
      await admin
        .from('almog_assignments')
        .update({ status: 'active', parent_assignment_id: originalId ?? null, relation })
        .eq('id', assignmentId)
        .eq('user_id', user.id);
    } else {
      const { data: inserted, error: assignErr } = await admin
        .from('almog_assignments')
        .insert({
          user_id: user.id,
          title: picked.micro_step,
          reason: `כדי להתגבר על: ${blocker.description}`,
          detail: picked.label,
          status: 'active',
          schedule: 'one_time',
          given_at: nowIso,
          parent_assignment_id: originalId ?? null,
          relation,
          dedupe_key: taskKey,
          created_by: 'almog',
          metadata: {
            source: 'blocker_intervention',
            blocker_id: blocker.id,
            strategy_type: picked.strategy_type,
            relation,
          },
        })
        .select('id')
        .maybeSingle();

      if (assignErr || !inserted) {
        // אם נכשל עקב כפילות (race) — מנסים לשלוף שוב.
        const { data: retry } = await admin
          .from('almog_assignments')
          .select('id')
          .eq('user_id', user.id)
          .eq('dedupe_key', taskKey)
          .maybeSingle();
        if (!retry) {
          return NextResponse.json({ error: assignErr?.message ?? 'Failed to create assignment' }, { status: 500 });
        }
        assignmentId = (retry as { id: string }).id;
      } else {
        assignmentId = (inserted as { id: string }).id;
      }
    }

    // טיפול במשימה המקורית לפי היחס:
    //  • replaces — המקורית יורדת (הוחלפה בצעד דומה ומתאים יותר).
    //  • eases    — המקורית מוקפאת זמנית; נחזיר אותה כשהצעד המקל יבוצע.
    if (originalId && (relation === 'replaces' || relation === 'eases')) {
      const { data: orig } = await admin
        .from('almog_assignments')
        .select('id, history')
        .eq('id', originalId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (orig) {
        const origHist = Array.isArray((orig as { history?: unknown }).history)
          ? ((orig as { history: Record<string, unknown>[] }).history)
          : [];
        await admin
          .from('almog_assignments')
          .update({
            status: relation === 'replaces' ? 'dropped' : 'frozen',
            history: [
              ...origHist,
              {
                at: nowIso,
                action: relation === 'replaces' ? 'dropped' : 'frozen',
                note:
                  relation === 'replaces'
                    ? `הוחלפה בצעד שמתאים לך יותר: ${picked.micro_step}`
                    : `הוקלה זמנית — נתחיל מ: ${picked.micro_step}`,
              },
            ].slice(-50),
          })
          .eq('id', originalId)
          .eq('user_id', user.id);
      }
    }

    const { data: intervention } = await admin
      .from('almog_interventions')
      .insert({
        user_id: user.id,
        blocker_id: blocker.id,
        barrier_type: category,
        strategy: picked.micro_step,
        strategy_type: picked.strategy_type,
        outcome: 'pending',
        assignment_id: assignmentId,
      })
      .select('id')
      .maybeSingle();

    const fireAt = defaultInterventionReminderIso(now);
    const remKey = `int|${blocker.id}|${taskKey.slice(0, 40)}|${fireAt.slice(0, 10)}`;

    // תזכורת מעקב — select-first/insert (אינדקס ייחודי חלקי, בלי ON CONFLICT).
    const { data: existingRem } = await admin
      .from('scheduled_reminders')
      .select('id')
      .eq('user_id', user.id)
      .eq('dedupe_key', remKey)
      .maybeSingle();
    if (!existingRem) {
      await admin.from('scheduled_reminders').insert({
        user_id: user.id,
        fire_at: fireAt,
        kind: 'followup',
        title: 'אלמוג חושב עליך 🌿',
        body: `רק בודק איתך — איך הלך עם "${picked.micro_step}"? גם אם לא יצא, בא נדבר על זה.`,
        assignment_id: assignmentId,
        blocker_id: blocker.id,
        status: 'pending',
        dedupe_key: remKey,
        metadata: { source: 'blocker_pick', intervention_id: (intervention as { id: string } | null)?.id },
      });
    }

    await admin
      .from('almog_blockers')
      .update({
        strategy: picked.micro_step,
        category,
        related_assignment_id: assignmentId,
        current_options: [],
        history: [
          ...history,
          { at: nowIso, status: blocker.status, note: `בחרנו: ${picked.label} — ${picked.micro_step}` },
        ].slice(-50),
      })
      .eq('id', blocker.id)
      .eq('user_id', user.id);

    return NextResponse.json({
      ok: true,
      assignment_id: assignmentId,
      strategy: picked.micro_step,
    });
  }

  // ── not_helped (PIVOT) ─────────────────────────────────────────
  if (data.action === 'not_helped') {
    const pending = await getPendingIntervention(admin, user.id, blocker.id);
    if (pending) {
      await admin
        .from('almog_interventions')
        .update({ outcome: 'not_helped', resolved_at: nowIso })
        .eq('id', pending.id)
        .eq('user_id', user.id);
    }

    const failedTypes = await getFailedStrategyTypes(admin, user.id, blocker.id);
    if (pending?.strategy_type) {
      failedTypes.push(normalizeStrategyType(pending.strategy_type));
    }

    const memory = await fetchInterventionMemory(admin, user.id);
    const attemptCount = (blocker.attempt_count ?? 0) + 1;
    const linkable = await getLinkableActiveTasks(admin, user.id);
    const taskByRef = new Map(linkable.map((t, i) => [`T${i + 1}`, t.id]));
    const activeTasks = linkable.map((t, i) => ({ ref: `T${i + 1}`, title: t.title }));

    const generated = await generateBlockerOptions({
      description: blocker.description,
      category: blocker.category,
      currentStrategy: blocker.strategy,
      attemptCount,
      memory,
      activeTasks,
      failedStrategyTypes: [...new Set(failedTypes)],
      pivotFromStrategy: pending?.strategy ?? blocker.strategy,
    });

    const relatedId = generated.relatesToRef ? taskByRef.get(generated.relatesToRef) ?? null : null;

    await admin
      .from('almog_blockers')
      .update({
        attempt_count: attemptCount,
        category: generated.category,
        current_options: generated.options,
        ...(relatedId ? { related_assignment_id: relatedId } : {}),
        last_checked_at: nowIso,
        history: [
          ...history,
          { at: nowIso, status: blocker.status, note: 'לא עזר — צריך גישה אחרת' },
        ].slice(-50),
      })
      .eq('id', blocker.id)
      .eq('user_id', user.id);

    return NextResponse.json({
      ok: true,
      pivot: true,
      category: generated.category,
      options: generated.options,
    });
  }

  // ── helped ─────────────────────────────────────────────────────
  if (data.action === 'helped') {
    const pending = await getPendingIntervention(admin, user.id, blocker.id);
    if (pending) {
      await admin
        .from('almog_interventions')
        .update({ outcome: 'helped', resolved_at: nowIso })
        .eq('id', pending.id)
        .eq('user_id', user.id);
    }

    await admin
      .from('almog_blockers')
      .update({
        status: 'improving',
        last_checked_at: nowIso,
        history: [...history, { at: nowIso, status: 'improving', note: 'עזר לי' }].slice(-50),
      })
      .eq('id', blocker.id)
      .eq('user_id', user.id);

    return NextResponse.json({ ok: true });
  }

  // ── resolve ────────────────────────────────────────────────────
  if (data.action === 'resolve') {
    const pending = await getPendingIntervention(admin, user.id, blocker.id);
    if (pending) {
      await admin
        .from('almog_interventions')
        .update({ outcome: 'resolved', resolved_at: nowIso })
        .eq('id', pending.id)
        .eq('user_id', user.id);
    }

    await admin
      .from('almog_blockers')
      .update({
        status: 'resolved',
        last_checked_at: nowIso,
        next_check_at: null,
        current_options: [],
        history: [...history, { at: nowIso, status: 'resolved', note: 'נפתר' }].slice(-50),
      })
      .eq('id', blocker.id)
      .eq('user_id', user.id);

    await admin
      .from('scheduled_reminders')
      .update({ status: 'cancelled' })
      .eq('user_id', user.id)
      .eq('blocker_id', blocker.id)
      .eq('status', 'pending');

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
