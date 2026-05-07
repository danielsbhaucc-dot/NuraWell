import { NextResponse } from 'next/server';
import { deepseek, openrouter, AI_MODELS } from '../../../../../../lib/ai/client';
import { getDeepseekAnalysisModel } from '../../../../../../lib/ai/deepseek-model';
import { buildUserContext, type AiUserContext } from '../../../../../../lib/ai/memory';
import { ANALYSIS_PROMPT, REENGAGEMENT_PROMPT } from '../../../../../../lib/ai/prompts';
import { createAdminClient } from '../../../../../../lib/supabase/admin';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Service-role Supabase client; tables like `ai_interactions` may be absent from generated `Database` types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = any;

const ALLOWED_CONTEXT_PATCH_KEYS = new Set([
  'weakness_pattern',
  'engagement_pattern',
  'tone_notes',
  'notes',
]);

function authorizeCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  const auth = request.headers.get('authorization');
  const q = new URL(request.url).searchParams.get('secret');
  if (auth === `Bearer ${secret}` || q === secret) {
    return null;
  }
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function parseAnalysisJson(raw: string): Partial<AiUserContext> {
  let t = raw.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  }
  const parsed = JSON.parse(t) as Record<string, unknown>;
  const out: Partial<AiUserContext> = {};
  for (const key of ALLOWED_CONTEXT_PATCH_KEYS) {
    const v = parsed[key];
    if (typeof v === 'string' && v.trim()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[key] = v.trim();
    }
  }
  return out;
}

async function runMasterCron() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' }, { status: 500 });
  }

  const admin: AdminDb = createAdminClient();

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const inactivityDays = Math.max(1, Number(process.env.CRON_INACTIVITY_DAYS) || 2);
  const inactiveBefore = new Date(Date.now() - inactivityDays * 24 * 60 * 60 * 1000).toISOString();
  const maxAnalysis = Math.min(100, Math.max(1, Number(process.env.CRON_MAX_ANALYSIS_USERS) || 20));
  const maxNudge = Math.min(100, Math.max(1, Number(process.env.CRON_MAX_NUDGE_USERS) || 20));
  const nudgeCooldownHours = Math.max(12, Number(process.env.CRON_NUDGE_COOLDOWN_HOURS) || 48);
  const cooldownIso = new Date(Date.now() - nudgeCooldownHours * 60 * 60 * 1000).toISOString();

  const errors: string[] = [];
  let analyzed = 0;
  let nudged = 0;
  let analysisSkipped = 0;
  let nudgeSkipped = 0;

  // --- 1) Distinct users with ai_interactions in the last 24h → DeepSeek analysis → merge ai_context
  const { data: interactionRows, error: intErr } = await admin
    .from('ai_interactions')
    .select('user_id')
    .gte('created_at', sinceIso);

  if (intErr) {
    errors.push(`ai_interactions: ${intErr.message}`);
  } else {
    const userIds = [
      ...new Set((interactionRows as { user_id: string }[] | null)?.map((r) => r.user_id) ?? []),
    ].slice(0, maxAnalysis);

    for (const userId of userIds) {
      try {
        const { data: lines, error: linesErr } = await admin
          .from('ai_interactions')
          .select('role, content, context_type, created_at')
          .eq('user_id', userId)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(40);

        if (linesErr) throw new Error(linesErr.message);
        const rows = (lines ?? []) as { role: string; content: string; context_type: string | null }[];
        if (rows.length === 0) {
          analysisSkipped++;
          continue;
        }

        const transcript = rows
          .reverse()
          .map((r) => `[${r.role}${r.context_type ? `/${r.context_type}` : ''}] ${r.content}`)
          .join('\n');

        const analysisModel = getDeepseekAnalysisModel();
        const completion = await deepseek.chat.completions.create({
          model: analysisModel,
          temperature: 0.2,
          messages: [
            { role: 'system', content: ANALYSIS_PROMPT },
            { role: 'user', content: `תמליל אינטראקציות (24 שעות אחרונות):\n\n${transcript}` },
          ],
        });

        const raw = completion.choices[0]?.message?.content?.trim();
        if (!raw) throw new Error('Empty analysis model output');

        let patch: Partial<AiUserContext>;
        try {
          patch = parseAnalysisJson(raw);
        } catch {
          throw new Error('Invalid JSON from analysis model');
        }

        if (Object.keys(patch).length === 0) {
          analysisSkipped++;
          continue;
        }

        const { data: prof, error: profErr } = await admin
          .from('profiles')
          .select('ai_context')
          .eq('id', userId)
          .single();

        if (profErr) throw new Error(profErr.message);

        const current = ((prof as { ai_context: AiUserContext | null } | null)?.ai_context ??
          {}) as AiUserContext;
        const merged = { ...current, ...patch };

        const { error: upErr } = await admin.from('profiles').update({ ai_context: merged }).eq('id', userId);
        if (upErr) throw new Error(upErr.message);
        analyzed++;
      } catch (e) {
        errors.push(`analysis ${userId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // --- 2) Inactive users → GPT-5-mini (OpenRouter) nudge → notifications (cooldown)
  const { data: stale, error: stErr } = await admin
    .from('profiles')
    .select('id, last_active_at')
    .lt('last_active_at', inactiveBefore)
    .order('last_active_at', { ascending: true })
    .limit(maxNudge);

  if (stErr) {
    errors.push(`profiles stale: ${stErr.message}`);
  } else {
    const staleIds = ((stale ?? []) as { id: string }[]).map((p) => p.id);

    for (const userId of staleIds) {
      try {
        const { data: recentNudge } = await admin
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('type', 'ai_message')
          .gte('created_at', cooldownIso)
          .limit(1);

        if (recentNudge && (recentNudge as unknown[]).length > 0) {
          nudgeSkipped++;
          continue;
        }

        const { contextString } = await buildUserContext(admin, userId);
        const systemPrompt = `${REENGAGEMENT_PROMPT}\n\n${contextString}`;

        const nudgeCompletion = await openrouter.chat.completions.create({
          model: AI_MODELS.empathy,
          temperature: 0.65,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content:
                'כתוב את גוף ההודעה לנוטיפיקציה בלבד (2–3 משפטים, מקסימום 50 מילים). בלי כותרת.',
            },
          ],
        });

        const body = nudgeCompletion.choices[0]?.message?.content?.trim();
        if (!body) throw new Error('Empty nudge text');

        const { error: insErr } = await admin.from('notifications').insert({
          user_id: userId,
          type: 'ai_message',
          title: 'אלמוג',
          body,
          icon_emoji: '🌿',
          action_url: '/journey',
          is_read: false,
          is_sent: false,
          send_at: new Date().toISOString(),
          metadata: { source: 'cron_master', model: AI_MODELS.empathy },
        });

        if (insErr) throw new Error(insErr.message);
        nudged++;
      } catch (e) {
        errors.push(`nudge ${userId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    window_hours: 24,
    inactivity_days: inactivityDays,
    analyzed,
    analysis_skipped: analysisSkipped,
    nudged,
    nudge_skipped: nudgeSkipped,
    errors: errors.length ? errors : undefined,
  });
}

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  return runMasterCron();
}

export async function POST(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  return runMasterCron();
}
