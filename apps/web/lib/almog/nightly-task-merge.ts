import type { SupabaseClient } from '@supabase/supabase-js';
import { parseLlmJsonObject } from '@/lib/ai/parse-llm-json';
import { meteredFetch } from '@/lib/ai/usage-meter';
import { gateAlmogUserFacingTouch } from '@/lib/notifications/almog-touch-send-gate';
import { insertNotification } from '@/lib/notifications/deliver';
import { levelInfo, resolveLadder, type TaskDefinitionLike } from '@/lib/tasks/ladder';

/**
 * Nightly "Almog checks": merge near-identical live tasks.
 *  1. SQL pre-filter (free): task_dup_candidates() flags users with likely duplicates.
 *  2. Only flagged users go to one cheap model call each (gpt-5.4-mini, static prompt first for caching).
 *  3. Merge via the single write path merge_task_assignments() (keeps higher level + progress, moves history, logs 'merged').
 *  4. One factual Almog notification through the unified gate + dedupe (no extra AI call).
 */
export const MERGE_MODEL = process.env.ALMOG_MERGE_MODEL?.trim() || 'openai/gpt-5.4-mini';

type Cand = { id: string; title: string; level: number; main: boolean; source: string; done: number };
export type MergeDecision = { keep: string; drop: string[]; reason?: string };

const SYSTEM = `אתה בודק כפילויות במשימות של אפליקציה לשינוי הרגלים.
תקבל רשימת משימות פעילות של משתמש אחד. החזר JSON בלבד: {"merges":[{"keep":"<id>","drop":["<id>",...],"reason":"<קצר>"}]}.
כפילות = אותה פעולה ואותו הרגל באותו הקשר, גם בניסוח אחר או בכמות קרובה (למשל "2 כוסות מים לפני ארוחה" ו"לשים 2 כוסות מים ליד הצלחת לפני הארוחה").
לא כפילות = הקשר או זמן שונה במהות (למשל "כוס מים לפני השינה" מול "מים לפני ארוחה"), או הרגל אחר.
ב-keep בחר את המשימה הראשית (main) אם יש, אחרת זו עם הכי הרבה done, אחרת המנוסחת הכי ברור. אם אין כפילויות החזר {"merges":[]}.`;

/** Validate model output against the candidate set (never trust ids blindly). */
export function sanitizeDecisions(raw: unknown, cands: Cand[]): MergeDecision[] {
  const ids = new Set(cands.map((c) => c.id));
  const used = new Set<string>();
  const out: MergeDecision[] = [];
  const merges = (raw as { merges?: unknown })?.merges;
  if (!Array.isArray(merges)) return out;
  for (const m of merges as MergeDecision[]) {
    if (!m || typeof m.keep !== 'string' || !ids.has(m.keep) || used.has(m.keep) || !Array.isArray(m.drop)) continue;
    const drop = [...new Set(m.drop.filter((d) => typeof d === 'string' && ids.has(d) && d !== m.keep && !used.has(d)))];
    if (!drop.length) continue;
    // a main task is never dropped; if the model tried, keep the main one instead
    const main = cands.find((c) => c.main && drop.includes(c.id));
    const keep = main ? main.id : m.keep;
    const finalDrop = main ? [...drop.filter((d) => d !== main.id), m.keep] : drop;
    used.add(keep);
    finalDrop.forEach((d) => used.add(d));
    out.push({ keep, drop: finalDrop, reason: typeof m.reason === 'string' ? m.reason.slice(0, 200) : undefined });
  }
  return out;
}

export function mergeMessage(firstName: string | null, merged: number, kept: { title: string; stage: number }): { title: string; body: string } {
  const hi = firstName ? `היי ${firstName}` : 'היי';
  const n = merged + 1;
  return {
    title: 'סידרתי לך את המשימות',
    body: `${hi}, שמתי לב שהיו לך ${n} משימות כמעט זהות, אז איחדתי אותן למשימה אחת: "${kept.title}" (שלב ${kept.stage}), כדי שיהיה לך פשוט יותר. נמשיך מכאן 💪`,
  };
}

/** Current title + 1-based ladder stage of the kept task. */
export async function keptTaskInfo(db: SupabaseClient, id: string): Promise<{ title: string; stage: number }> {
  const { data } = await db.from('user_task_assignments').select('current_level, definition:task_definitions(title, times_per_day, ladder, floor_level, max_level)').eq('id', id).maybeSingle();
  const def = (data?.definition ?? null) as unknown as TaskDefinitionLike | null;
  if (!def) return { title: 'המשימה', stage: 1 };
  const lvl = Number(data?.current_level ?? 0);
  const info = levelInfo(def, lvl);
  return { title: info.title, stage: Math.max(1, resolveLadder(def).findIndex((l) => l.level === info.level) + 1) };
}

export async function runNightlyTaskMerge(db: SupabaseClient, deps: { decide?: (c: Cand[]) => Promise<unknown> } = {}) {
  const { data, error } = await db.rpc('task_dup_candidates', { p_limit: 200 });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { user_id: string; tasks: Cand[] }[];
  const decide =
    deps.decide ??
    (async (c: Cand[]) => {
      const r = await meteredFetch(fetch, { feature: 'almog_task_merge' })('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY?.trim() ?? ''}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: MERGE_MODEL, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify(c) }], response_format: { type: 'json_object' } }),
      });
      if (!r.ok) throw new Error(`openrouter ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      return parseLlmJsonObject(j.choices?.[0]?.message?.content ?? '');
    });

  const summary = { flaggedUsers: rows.length, mergedTasks: 0, usersMerged: 0, notified: 0, errors: [] as string[] };
  for (const row of rows) {
    let decisions: MergeDecision[] = [];
    try {
      decisions = sanitizeDecisions(await decide(row.tasks), row.tasks);
    } catch (e) {
      summary.errors.push(String(e).slice(0, 200));
      continue;
    }
    let merged = 0;
    let mainKeep: string | null = null;
    for (const d of decisions) {
      const { data: n, error: e } = await db.rpc('merge_task_assignments', { p_user: row.user_id, p_keep: d.keep, p_drop: d.drop, p_reason: d.reason ?? null });
      if (e) summary.errors.push(`merge: ${e.message.slice(0, 150)}`);
      else {
        merged += Number(n) || 0;
        mainKeep ??= d.keep;
      }
    }
    if (!merged || !mainKeep) continue;
    summary.mergedTasks += merged;
    summary.usersMerged += 1;
    const gate = await gateAlmogUserFacingTouch(db, row.user_id);
    if (!gate.ok) {
      summary.errors.push(`gate: ${gate.reason}`);
      continue;
    }
    const { data: p } = await db.from('profiles').select('full_name').eq('id', row.user_id).maybeSingle();
    const first = ((p?.full_name as string | null) ?? '').trim().split(/\s+/)[0] || null;
    const msg = mergeMessage(first, merged, await keptTaskInfo(db, mainKeep));
    const res = await insertNotification(db, {
      user_id: row.user_id,
      type: 'ai_message',
      title: msg.title,
      body: msg.body,
      icon_emoji: '🧹',
      action_url: `/plans?task=${mainKeep}`,
      is_read: false,
      is_sent: false,
      send_at: new Date().toISOString(),
      metadata: { source: 'almog_nightly_merge', merged },
    });
    if (!res.error) summary.notified += 1;
    else summary.errors.push(`notify: ${res.error.message.slice(0, 150)}`);
  }
  return summary;
}
