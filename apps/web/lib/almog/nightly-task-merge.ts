import type { SupabaseClient } from '@supabase/supabase-js';
import { parseLlmJsonObject } from '@/lib/ai/parse-llm-json';
import { meteredFetch, withAiUser } from '@/lib/ai/usage-meter';
import { gateAlmogUserFacingTouch } from '@/lib/notifications/almog-touch-send-gate';
import { insertNotification } from '@/lib/notifications/deliver';
import { levelInfo, resolveLadder, type TaskDefinitionLike } from '@/lib/tasks/ladder';

/**
 * Nightly "Almog checks": merge near-identical live tasks.
 *  1. SQL pre-filter (free): task_dup_candidates() flags users with likely duplicates.
 *  2. Only flagged users go to one cheap model call each (gpt-5.4-mini, static prompt first for caching).
 *  3. Merge by behavior via merge_task_assignments(); the model may set the kept task's ladder level (e.g. an easier step
 *     that existed because the main task was hard). Moves history, logs level_change + 'merged' with the reason.
 *  4. One factual Almog notification through the unified gate + dedupe (no extra AI call).
 */
export const MERGE_MODEL = process.env.ALMOG_MERGE_MODEL?.trim() || 'openai/gpt-5.4-mini';

type Cand = {
  id: string;
  title: string;
  level: number;
  main: boolean;
  source: string;
  done: number;
  ladder?: { level: number; title: string }[];
  [k: string]: unknown;
};
export type MergeDecision = { keep: string; drop: string[]; level?: number; reason?: string };

const SYSTEM = `אתה מאחד משימות של אפליקציה לשינוי הרגלים. העיקרון: התנהגות אחת = משימה אחת. אין טעם לבקש מהמשתמש לשתות מים פעמיים.
תקבל את המשימות הפעילות של משתמש אחד, ולכל אחת את המקור וההיסטוריה שלה: source (step = מתוך שיעור, almog = נוצרה בצ'אט עם אלמוג, ai_daily = משימה יומית), why (למה נוצרה), chat_excerpt (מה המשתמש כתב כשנוצרה), related_habit (ההרגל שאליו היא קשורה), ladder (שלבי הקושי של המשימה: level 0 = היעד, שלילי = קל יותר), history (שינויי רמה, "קשה לי", SOS, איחודים, עם סיבה ותאריך).
כללים:
1. אחד באגרסיביות לפי התנהגות/נושא, לא לפי ניסוח: כל המשימות על אותה התנהגות (למשל "2 כוסות מים לפני הארוחה", "חצי כוס מים", "כוס מים קטנה לפני השינה", "לשים כוס ליד הצלחת") הופכות למשימה אחת. השאר נפרדות רק התנהגויות שונות באמת (מים מול הליכה מול ירקות).
1א. משימה חד-פעמית (schedule=one_time) על אותה התנהגות כמו משימה קבועה — תמיד מתאחדת לתוך המשימה הקבועה.
2. keep = המשימה הראשית (main) אם יש, אחרת זו שמגיעה משיעור (step), אחרת זו עם סולם שלבים, אחרת עם הכי הרבה done.
3. השתמש במקור ובהיסטוריה רק כדי לבחור שלב: אם משימה שמאוחדת נוצרה כגרסה קלה יותר כי היה קשה (קשה לי, SOS, תחושת כישלון, ירידת רמה), או שהמשתמש ירד רמה לאחרונה, בחר ב-level את שלב ה-ladder של keep שהכי קרוב לגרסה הקלה (לרוב הנמוך ביותר). אם אין סיבה לשנות, השמט level. level חייב להיות אחד מערכי ה-ladder של keep.
4. reason: משפט קצר בעברית שמסביר למה אוחד ולמה השלב.
החזר json בלבד (פורמט json): {"merges":[{"keep":"<id>","drop":["<id>",...],"level":<מספר או להשמיט>,"reason":"<קצר>"}]}. אם אין מה לאחד החזר {"merges":[]}.`;

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
    const keepCand = cands.find((c) => c.id === keep);
    const rawLevel = (m as { level?: unknown }).level;
    const lv = Number(rawLevel);
    const levels = (keepCand?.ladder ?? []).map((l) => Number(l.level));
    const dec: MergeDecision = { keep, drop: finalDrop, reason: typeof m.reason === 'string' ? m.reason.slice(0, 200) : undefined };
    if (rawLevel != null && rawLevel !== '' && Number.isInteger(lv) && levels.includes(lv) && lv !== keepCand?.level) dec.level = lv;
    out.push(dec);
  }
  return out;
}

/** Behavior families (deterministic). Order matters: "כוס מים לפני השינה" is water, not sleep. */
const BEHAVIORS: Array<[string, RegExp]> = [
  ['water', /(מים|כוס|כוסות|לשתות|שתיי?ה|בקבוק)/u],
  ['walk', /(הליכ|ללכת ברגל|צעדים|לצעוד)/u],
  ['veg', /(ירק|סלט)/u],
  ['sleep', /(שינה|לישון|להירדם)/u],
  ['sweets', /(מתוק|סוכר|חטיף)/u],
];
export function behaviorOf(c: Pick<Cand, 'title'> & { habit?: unknown; related_habit?: unknown }): string | null {
  const text = [c.title, c.related_habit, typeof c.habit === 'string' && !/^(almog|ai_daily):/.test(c.habit) ? c.habit : '']
    .filter(Boolean)
    .join(' ');
  if (typeof c.habit === 'string' && /^water$/i.test(c.habit)) return 'water';
  for (const [k, re] of BEHAVIORS) if (re.test(text)) return k;
  return null;
}
const isOneTime = (c: Cand) => c.schedule === 'one_time';

/**
 * Daniel's rule: never tell the user to do the same behavior twice. After the model's decisions, every remaining
 * one-time task whose behavior matches a recurring task is folded into that recurring task (main first).
 */
export function foldOneTimeByBehavior(decisions: MergeDecision[], cands: Cand[]): MergeDecision[] {
  const out = decisions.map((d) => ({ ...d, drop: [...d.drop] }));
  const used = new Set(out.flatMap((d) => [d.keep, ...d.drop]));
  const dropped = new Set(out.flatMap((d) => d.drop));
  const recurring = cands
    .filter((c) => !isOneTime(c) && !dropped.has(c.id) && behaviorOf(c))
    .sort((a, b) => Number(b.main) - Number(a.main) || b.done - a.done);
  for (const r of recurring) {
    const b = behaviorOf(r);
    const extra = cands.filter((o) => o.id !== r.id && isOneTime(o) && !used.has(o.id) && behaviorOf(o) === b);
    if (!extra.length) continue;
    extra.forEach((o) => used.add(o.id));
    used.add(r.id);
    const existing = out.find((d) => d.keep === r.id);
    if (existing) existing.drop.push(...extra.map((o) => o.id));
    else out.push({ keep: r.id, drop: extra.map((o) => o.id), reason: 'משימה חד-פעמית על אותה התנהגות אוחדה למשימה הקבועה' });
  }
  return out;
}

export function mergeMessage(
  firstName: string | null,
  merged: number,
  kept: { title: string; stage: number; mainTitle?: string },
  change?: { fromLevel: number; toLevel: number; mergedTitles?: string[] },
): { title: string; body: string } {
  const hi = firstName ? `היי ${firstName}` : 'היי';
  const names = (change?.mergedTitles ?? []).filter(Boolean).slice(0, 2).map((t) => `"${t}"`).join(' ו-');
  const verb = merged === 1 ? 'היתה' : 'היו';
  const main = kept.mainTitle ?? kept.title;
  if (change && change.toLevel < change.fromLevel) {
    return {
      title: 'סידרתי לך את המשימות',
      body: `${hi}, ${names || (merged === 1 ? 'משימה אחת' : `${merged} משימות`)} ${verb} בעצם גרסה קלה יותר של המשימה "${main}", אז איחדתי למשימה אחת וקבעתי אותה לשלב קל יותר: "${kept.title}" (שלב ${kept.stage}). כשזה ירגיש קל, נעלה יחד 💪`,
    };
  }
  const lead = names ? `${names} ${verb} על אותו הרגל כמו "${main}"` : `היו לך ${merged + 1} משימות על אותו הרגל`;
  return {
    title: 'סידרתי לך את המשימות',
    body: `${hi}, ${lead}, אז איחדתי הכול למשימה אחת: "${kept.title}" (שלב ${kept.stage}), כדי שיהיה לך פשוט יותר. נמשיך מכאן 💪`,
  };
}

/** Current title + 1-based ladder stage of the kept task. */
export async function keptTaskInfo(db: SupabaseClient, id: string): Promise<{ title: string; stage: number; mainTitle?: string }> {
  const { data } = await db.from('user_task_assignments').select('current_level, definition:task_definitions(title, times_per_day, ladder, floor_level, max_level)').eq('id', id).maybeSingle();
  const def = (data?.definition ?? null) as unknown as TaskDefinitionLike | null;
  if (!def) return { title: 'המשימה', stage: 1 };
  const lvl = Number(data?.current_level ?? 0);
  const info = levelInfo(def, lvl);
  return { title: info.title, mainTitle: (def as { title?: string }).title, stage: Math.max(1, resolveLadder(def).findIndex((l) => l.level === info.level) + 1) };
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
        body: JSON.stringify({ model: MERGE_MODEL, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `tasks json:\n${JSON.stringify(c)}` }], response_format: { type: 'json_object' } }),
      });
      if (!r.ok) throw new Error(`openrouter ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      return parseLlmJsonObject(j.choices?.[0]?.message?.content ?? '');
    });

  const summary = { flaggedUsers: rows.length, mergedTasks: 0, usersMerged: 0, notified: 0, errors: [] as string[] };
  for (const row of rows) {
    let decisions: MergeDecision[] = [];
    try {
      decisions = foldOneTimeByBehavior(sanitizeDecisions(await withAiUser(row.user_id, () => decide(row.tasks)), row.tasks), row.tasks);
    } catch (e) {
      summary.errors.push(String(e).slice(0, 200));
      continue;
    }
    let merged = 0;
    let mainKeep: string | null = null;
    let mainCount = 0;
    let mainChange: { fromLevel: number; toLevel: number; mergedTitles: string[] } | undefined;
    for (const d of decisions) {
      const { data: n, error: e } = await db.rpc('merge_task_assignments', { p_user: row.user_id, p_keep: d.keep, p_drop: d.drop, p_reason: d.reason ?? null, p_level: d.level ?? null });
      if (e) summary.errors.push(`merge: ${e.message.slice(0, 150)}`);
      else {
        const k = Number(n) || 0;
        merged += k;
        if (k > mainCount) {
          mainCount = k;
          mainKeep = d.keep;
          const from = Number(row.tasks.find((t) => t.id === d.keep)?.level ?? 0);
          mainChange = { fromLevel: from, toLevel: d.level ?? from, mergedTitles: d.drop.map((id) => row.tasks.find((t) => t.id === id)?.title ?? '') };
        }
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
    const msg = mergeMessage(first, mainCount, await keptTaskInfo(db, mainKeep), mainChange);
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
      metadata: { source: 'almog_nightly_merge', merged, ...(mainChange ? { from_level: mainChange.fromLevel, to_level: mainChange.toLevel } : {}) },
    });
    if (!res.error) summary.notified += 1;
    else summary.errors.push(`notify: ${res.error.message.slice(0, 150)}`);
  }
  return summary;
}
