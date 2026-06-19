/**
 * טקסטים אנושיים ל"למה הצעד קיים" — מחברים reason, metadata וחסם לסיפור אחד.
 */

export type StepStoryInput = {
  title: string;
  reason?: string | null;
  detail?: string | null;
  sourceExcerpt?: string | null;
  relation?: 'standalone' | 'replaces' | 'eases' | 'supports' | null;
  metadata?: Record<string, unknown> | null;
  blockerDescription?: string | null;
  blockerSource?: string | null;
  originalTitle?: string | null;
};

export type StepStory = {
  tag: string;
  headline: string;
  why: string;
  observed: string;
  helps: string;
};

const SIGNAL_LABELS: Record<string, string> = {
  no_update_today: 'לא עדכנת היום על המשימה מהשיעור',
  partial_today: 'סימנת ביצוע חלקי היום (לא את כל מה שתוכנן)',
  partial_pattern: 'יש כמה ימים ברצף עם ביצוע חלקי',
  inactive_days: 'עברו כמה ימים בלי עדכון על המשימה',
  explicit_hard: 'דיווחת שהרמה הנוכחית קשה מדי',
};

const SOURCE_TAGS: Record<string, string> = {
  journey_too_hard: 'מהשיעור',
  journey_eased: 'התאמה מהשיעור',
  journey_original: 'משימה מהשיעור',
  orchestrator_pivot: 'התאמה אישית',
  orchestrator_original: 'מהשיעור',
  chat: 'מסיכום בשיחה',
  assignment_sweep: 'מעקב אוטומטי',
  recovery_insight: 'מעקב התקדמות',
};

function metaStr(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = meta?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function pickObserved(input: StepStoryInput): string {
  const signal = metaStr(input.metadata ?? null, 'signal_kind');
  if (signal && SIGNAL_LABELS[signal]) return SIGNAL_LABELS[signal];

  if (input.blockerDescription?.trim()) return input.blockerDescription.trim();

  const expected = input.metadata?.expected;
  const reported = input.metadata?.reported;
  if (typeof expected === 'number' && typeof reported === 'number' && expected > 0) {
    return `היום סומן ${reported} מתוך ${expected} מה שתוכנן`;
  }

  if (input.sourceExcerpt?.trim()) return `בשיחה אמרת: «${input.sourceExcerpt.trim()}»`;
  if (input.detail?.trim()) return input.detail.trim();
  if (input.reason?.trim()) return input.reason.trim();

  return 'שמתי לב שצריך צעד קטן וברור יותר';
}

function pickWhy(input: StepStoryInput): string {
  if (input.relation === 'eases' && input.originalTitle) {
    return `«${input.originalTitle}» מהשיעור מרגישה כבדה כרגע — לכן יצרנו גרסה מותאמת`;
  }
  if (input.reason?.trim()) return input.reason.trim();
  if (input.blockerDescription?.trim()) return input.blockerDescription.trim();
  return 'סיכמנו ביחד שצעד קטן יעזור להתקדם בלי עומס';
}

function pickHelps(input: StepStoryInput): string {
  if (input.relation === 'eases') {
    return 'בונים הצלחות קטנות — אחרי כמה ימים טובים נחזור בהדרגה למשימה המקורית';
  }
  if (input.relation === 'replaces') {
    return 'מחליפים משימה שלא עבדה בגישה שמתאימה יותר לשגרה שלך';
  }
  if (input.relation === 'supports') {
    return 'צעד עזר שמחזיק אותך בדרך למטרה הגדולה יותר';
  }
  return 'צעד אחד ברור — סימון קצר אחרי שעשית, ואני איתך אם משהו לא מרגיש נכון';
}

function pickTag(input: StepStoryInput): string {
  const assignmentSrc = metaStr(input.metadata ?? null, 'source');
  const src =
    assignmentSrc ??
    input.blockerSource ??
    (input.sourceExcerpt ? 'chat' : null);
  if (src && SOURCE_TAGS[src]) return SOURCE_TAGS[src];
  if (input.relation === 'eases') return 'התאמה מהשיעור';
  if (input.sourceExcerpt) return 'מסיכום בשיחה';
  return 'התוכנית שלך';
}

export function buildStepStory(input: StepStoryInput): StepStory {
  const why = pickWhy(input);
  const observed = pickObserved(input);
  const helps = pickHelps(input);
  const tag = pickTag(input);
  const headline =
    input.relation === 'eases' && input.originalTitle
      ? `צעד מותאם בדרך חזרה ל«${input.originalTitle}»`
      : input.title;

  return { tag, headline, why, observed, helps };
}

export function storyFromAssignment(
  assignment: {
    title: string;
    reason: string | null;
    detail: string | null;
    source_excerpt: string | null;
    relation: StepStoryInput['relation'];
    metadata?: Record<string, unknown> | null;
  },
  opts?: { blocker?: { description: string; metadata?: Record<string, unknown> | null } | null; originalTitle?: string | null }
): StepStory {
  const blockerMeta = opts?.blocker?.metadata ?? null;
  return buildStepStory({
    title: assignment.title,
    reason: assignment.reason,
    detail: assignment.detail,
    sourceExcerpt: assignment.source_excerpt,
    relation: assignment.relation,
    metadata: assignment.metadata,
    blockerDescription: opts?.blocker?.description ?? null,
    blockerSource: metaStr(blockerMeta, 'source'),
    originalTitle: opts?.originalTitle ?? null,
  });
}
