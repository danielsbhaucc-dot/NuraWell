import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type GuideAccessType,
  type GuideGrantedBy,
  TRIAL_DAYS_BY_SIGNAL,
} from './access';

export type GuideAccessSignal =
  | 'shabbat'
  | 'holidays'
  | 'stress'
  | 'default';

export interface GrantGuideAccessParams {
  supabase: SupabaseClient;
  userId: string;
  courseId: string;
  accessType: GuideAccessType;
  grantedBy: GuideGrantedBy;
  grantedReason: string;
  signalText?: string;
  trialDays?: number;
}

export interface GrantGuideAccessResult {
  granted: boolean;
  alreadyHadAccess: boolean;
  enrollmentId?: string;
  trialEndsAt?: string | null;
  message: string;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** פותח או מרחיב גישה למדריך + לוג. */
export async function grantGuideAccess(
  params: GrantGuideAccessParams
): Promise<GrantGuideAccessResult> {
  const { supabase, userId, courseId, accessType, grantedBy, grantedReason, signalText } = params;
  const trialDays = params.trialDays ?? (accessType === 'trial' ? TRIAL_DAYS_BY_SIGNAL.default : undefined);
  const trialEndsAt = accessType === 'trial' && trialDays ? addDays(trialDays) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await supabase
    .from('enrollments')
    .select('id, is_active, access_type, trial_ends_at')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (existing?.is_active && existing.access_type === 'full') {
    return {
      granted: false,
      alreadyHadAccess: true,
      enrollmentId: existing.id,
      message: 'כבר יש גישה מלאה למדריך',
    };
  }

  const payload = {
    user_id: userId,
    course_id: courseId,
    is_active: true,
    access_type: accessType,
    trial_ends_at: trialEndsAt,
    granted_by: grantedBy,
    granted_reason: grantedReason,
  };

  let enrollmentId: string;

  if (existing?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error } = await supabase
      .from('enrollments')
      .update(payload)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error || !updated) {
      return { granted: false, alreadyHadAccess: false, message: error?.message ?? 'שגיאת עדכון רישום' };
    }
    enrollmentId = updated.id;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error } = await supabase
      .from('enrollments')
      .insert(payload)
      .select('id')
      .single();
    if (error || !inserted) {
      return { granted: false, alreadyHadAccess: false, message: error?.message ?? 'שגיאת יצירת רישום' };
    }
    enrollmentId = inserted.id;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await supabase.from('guide_access_grants').insert({
    user_id: userId,
    course_id: courseId,
    access_type: accessType,
    trial_ends_at: trialEndsAt,
    granted_by: grantedBy,
    granted_reason: grantedReason,
    signal_text: signalText ?? null,
  });

  const msg =
    accessType === 'trial' && trialEndsAt
      ? `נפתחה גישת ניסיון למדריך עד ${new Date(trialEndsAt).toLocaleDateString('he-IL')}`
      : 'נפתחה גישה מלאה למדריך';

  return {
    granted: true,
    alreadyHadAccess: false,
    enrollmentId,
    trialEndsAt,
    message: msg,
  };
}

/** מיפוי מילות מפתח לסיגנל גישה. */
const SIGNAL_PATTERNS: Array<{ signal: GuideAccessSignal; patterns: RegExp[]; reason: string }> = [
  {
    signal: 'shabbat',
    patterns: [/שבת/i, /שבתות/i, /לפני שבת/i, /אחרי שבת/i, /שומר שבת/i, /שבת קודש/i],
    reason: 'קושי בהתמודדות עם שבתות',
  },
  {
    signal: 'holidays',
    patterns: [/חג/i, /חגים/i, /פסח/i, /סוכות/i, /ראש השנה/i, /יום כיפור/i],
    reason: 'קושי בתקופת חגים',
  },
  {
    signal: 'stress',
    patterns: [/לחץ/i, /עומס/i, /מתח/i, /חרדה/i, /קשה לי/i, /לא מצליח/i],
    reason: 'מצוקה רגשית/לחץ שדורש ליווי',
  },
];

export function detectGuideAccessSignal(userMessage: string): {
  signal: GuideAccessSignal;
  reason: string;
} | null {
  const msg = userMessage.replace(/\s+/g, ' ').trim();
  if (msg.length < 4) return null;

  for (const entry of SIGNAL_PATTERNS) {
    if (entry.patterns.some((p) => p.test(msg))) {
      return { signal: entry.signal, reason: entry.reason };
    }
  }
  return null;
}

/** מחפש מדריך מתאים לפי סיגנל (title/description match). */
export async function findGuideForSignal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  signal: GuideAccessSignal
): Promise<{ id: string; title: string } | null> {
  const keywords: Record<GuideAccessSignal, string[]> = {
    shabbat: ['שבת', 'שבתות'],
    holidays: ['חג', 'חגים', 'פסח'],
    stress: ['לחץ', 'רגש', 'התמודדות'],
    default: [],
  };

  const { data: courses } = await supabase
    .from('courses')
    .select('id, title, description')
    .eq('is_published', true)
    .order('sort_order');

  if (!courses?.length) return null;

  const kws = keywords[signal] ?? keywords.default;
  for (const kw of kws) {
    const match = courses.find(
      (c: { title: string; description: string | null }) =>
        c.title.includes(kw) || (c.description ?? '').includes(kw)
    );
    if (match) return { id: match.id, title: match.title };
  }

  return { id: courses[0].id, title: courses[0].title };
}
