import type { SupabaseClient } from '@supabase/supabase-js';

import { openrouter } from './client';
import { buildCoachingStylePromptBlock } from './almog-coaching-style';
import { buildUserContext } from './memory';

export type WeightTrendStats = {
  count: number;
  latestKg: number | null;
  latestDate: string | null;
  earliestKg: number | null;
  changeKg: number | null;
  /** מגמה ב-30 ימים אחרונים (ק"ג) */
  change30Kg: number | null;
  goalKg: number | null;
  /** האם המשקל "תקוע" (שינוי קטן מ-0.4 ק"ג ב-14+ ימים עם 3+ מדידות) */
  plateau: boolean;
  spanDays: number;
};

export type TrendInsight = {
  /** משפט סיכום אחד של המגמה */
  summary: string;
  /** עד 3 דברים מעשיים לבדוק/לנסות */
  checklist: string[];
  /** טון/מצב — לצביעה בקליינט */
  tone: 'positive' | 'plateau' | 'concern' | 'neutral';
};

export type TrendInsightResult = {
  stats: WeightTrendStats;
  insight: TrendInsight | null;
  used_fallback: boolean;
  model: string | null;
};

type MeasurementRow = { measured_at: string; weight_kg: number | null };

const TREND_MODEL = 'openai/gpt-5-mini';

const TREND_SYSTEM_PROMPT = `אתה אלמוג — מנטור הליווי של NuraWell. אתה מנתח מגמת משקל ונותן תובנה יזומה, חמה ומעשית — לא דוח יבש.
תקבל סטטיסטיקת משקל מחושבת. המשימה: לנסח תובנה אישית קצרה + עד 3 דברים קונקרטיים לבדוק/לנסות.

החזר JSON בלבד:
{
  "summary": "משפט אחד חם שמתאר את המגמה בשפה אנושית (לדוגמה: 'המשקל יציב כבר שבועיים — זה לא תקוע, זה הגוף מתייצב'). בלי שפת מערכת.",
  "checklist": ["עד 3 דברים מעשיים וספציפיים לבדוק או לנסות. כל פריט קצר ופרקטי."],
  "tone": "positive | plateau | concern | neutral"
}

כללים:
- אם יש ירידה לכיוון היעד → positive, חגוג בעדינות.
- אם תקוע (plateau) → הסבר רגוע שזה נורמלי, ותן 3 דברים לבדוק (שתייה, שינה, מדידה באותה שעה, חלבון...).
- אם עלייה → בלי אשמה ובלי דרמה, רק סקרנות מה השתנה.
- אל תיתן ייעוץ רפואי. אם יש שינוי חד/מדאיג — הצע להיוועץ באיש מקצוע.
- חם, אנושי, קצר. בלי "המערכת", בלי מספרים מיותרים.`;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function computeStats(rows: MeasurementRow[], goalKg: number | null): WeightTrendStats {
  const points = rows
    .filter((r) => typeof r.weight_kg === 'number' && Number.isFinite(r.weight_kg))
    .map((r) => ({ date: r.measured_at, kg: r.weight_kg as number }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length === 0) {
    return {
      count: 0,
      latestKg: null,
      latestDate: null,
      earliestKg: null,
      changeKg: null,
      change30Kg: null,
      goalKg,
      plateau: false,
      spanDays: 0,
    };
  }

  const first = points[0];
  const last = points[points.length - 1];
  const dayMs = 24 * 60 * 60 * 1000;
  const spanDays = Math.round(
    (new Date(last.date).getTime() - new Date(first.date).getTime()) / dayMs
  );

  const thirtyAgo = Date.now() - 30 * dayMs;
  const within30 = points.filter((p) => new Date(p.date).getTime() >= thirtyAgo);
  const change30Kg =
    within30.length >= 2 ? round1(last.kg - within30[0].kg) : null;

  // plateau: 3+ נקודות, פרק זמן 14+ ימים, ושינוי כולל קטן מ-0.4 ק"ג
  const plateau =
    points.length >= 3 && spanDays >= 14 && Math.abs(last.kg - first.kg) < 0.4;

  return {
    count: points.length,
    latestKg: round1(last.kg),
    latestDate: last.date,
    earliestKg: round1(first.kg),
    changeKg: round1(last.kg - first.kg),
    change30Kg,
    goalKg,
    plateau,
    spanDays,
  };
}

function buildFallbackInsight(stats: WeightTrendStats): TrendInsight | null {
  if (stats.count === 0) return null;

  if (stats.plateau) {
    return {
      summary:
        'המשקל יציב כבר כמה שבועות — זה לא בהכרח "תקוע", לפעמים הגוף פשוט מתייצב לפני הצעד הבא.',
      checklist: [
        'תשתדל לשתות מספיק מים לאורך היום',
        'תמדוד באותה שעה ובאותם תנאים (בבוקר, אחרי שירותים)',
        'תוודא שאתה ישן מספיק — שינה משפיעה ישירות',
      ],
      tone: 'plateau',
    };
  }

  if (stats.changeKg !== null && stats.goalKg !== null) {
    const towardGoal =
      (stats.goalKg < (stats.latestKg ?? 0) && stats.changeKg < 0) ||
      (stats.goalKg > (stats.latestKg ?? 0) && stats.changeKg > 0);
    if (towardGoal && Math.abs(stats.changeKg) >= 0.3) {
      return {
        summary: `יפה — ${Math.abs(stats.changeKg)} ק"ג לכיוון הנכון. זה בדיוק מה שמתמדה עושה לאורך זמן.`,
        checklist: ['תמשיך עם מה שעובד', 'תשמור על העקביות גם בסופ"ש'],
        tone: 'positive',
      };
    }
  }

  return {
    summary: 'יש לך כמה מדידות — בוא נמשיך לעקוב יחד ונראה את התמונה הגדולה.',
    checklist: ['תמדוד פעם-פעמיים בשבוע', 'אל תיבהל מתנודות יומיות — מסתכלים על המגמה'],
    tone: 'neutral',
  };
}

export async function buildTrendInsight(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient | any;
  userId: string;
}): Promise<TrendInsightResult> {
  const { supabase, userId } = params;

  const [{ data: measurementRows }, { data: profileRow }] = await Promise.all([
    supabase
      .from('user_measurements')
      .select('measured_at, weight_kg')
      .eq('user_id', userId)
      .order('measured_at', { ascending: false })
      .limit(20),
    supabase.from('profiles').select('goal_weight_kg').eq('id', userId).maybeSingle(),
  ]);

  const goalKg =
    typeof (profileRow as { goal_weight_kg: number | null } | null)?.goal_weight_kg === 'number'
      ? (profileRow as { goal_weight_kg: number }).goal_weight_kg
      : null;

  const stats = computeStats((measurementRows as MeasurementRow[]) ?? [], goalKg);

  if (stats.count < 2) {
    return {
      stats,
      insight: stats.count === 1 ? buildFallbackInsight(stats) : null,
      used_fallback: true,
      model: null,
    };
  }

  const fallback = buildFallbackInsight(stats);

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return { stats, insight: fallback, used_fallback: true, model: null };
  }

  const contextResult = await buildUserContext(supabase, userId).catch(() => null);
  const coachingBlock = buildCoachingStylePromptBlock(contextResult?.raw.aiContext ?? null);

  const statsText = [
    `מספר מדידות: ${stats.count}`,
    `משקל אחרון: ${stats.latestKg} ק"ג (${stats.latestDate})`,
    stats.goalKg !== null ? `יעד: ${stats.goalKg} ק"ג` : null,
    stats.changeKg !== null ? `שינוי כולל מאז המדידה הראשונה: ${stats.changeKg} ק"ג על פני ${stats.spanDays} ימים` : null,
    stats.change30Kg !== null ? `שינוי ב-30 ימים אחרונים: ${stats.change30Kg} ק"ג` : null,
    stats.plateau ? 'מצב: יציב/תקוע (שינוי מינימלי ב-14+ ימים)' : null,
  ]
    .filter(Boolean)
    .join('\n');

  const userContent = [statsText, coachingBlock || null].filter(Boolean).join('\n\n');

  try {
    const completion = await openrouter.chat.completions.create({
      model: TREND_MODEL,
      temperature: 0.6,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: TREND_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Record<
      string,
      unknown
    >;
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    if (!summary) {
      return { stats, insight: fallback, used_fallback: true, model: TREND_MODEL };
    }

    const checklist = Array.isArray(parsed.checklist)
      ? parsed.checklist
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((x) => x.trim().slice(0, 120))
          .slice(0, 3)
      : [];

    const tone = ['positive', 'plateau', 'concern', 'neutral'].includes(parsed.tone as string)
      ? (parsed.tone as TrendInsight['tone'])
      : 'neutral';

    return {
      stats,
      insight: { summary: summary.slice(0, 280), checklist, tone },
      used_fallback: false,
      model: TREND_MODEL,
    };
  } catch (error) {
    console.error('[trend-insights-llm] generation failed', error);
    return { stats, insight: fallback, used_fallback: true, model: TREND_MODEL };
  }
}
