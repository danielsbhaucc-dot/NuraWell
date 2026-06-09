/**
 * הקשר חיים מהצ'אט — זיהוי אירועים (לא רק חופשה/אשפוז), regex בלי LLM.
 */

import { buildSlotDaypartPromptBlock } from './almog-notify-day-context';
import { AI_MODELS } from './client';
import { crisisCooldownUntilIso } from './avoid-push';
import { completeEmpathyNotifyBody } from './empathy-notify-completion';
import { israelDateKey } from './onboarding-check-in-time';
import type { AiUserContext } from './memory';
import { updateAiContext } from './memory';
import { fetchNotifyUserProfile } from './notify-user-profile';
import { ALMOG_NOTIFY_MAX_OUTPUT_TOKENS, buildCompactAlmogNotifyPrompt } from './prompts';
import { habitSlotFromCheckInTime } from '../workflows/personalized-check-in-journey';

const IL_TZ = 'Asia/Jerusalem';
const DAY_MS = 24 * 60 * 60 * 1000;

/** פרופיל התנהגות — לא שם האירוע הספציפי */
export type LifeContextProfile = 'pause' | 'away' | 'busy';

export type LifeContextKind = LifeContextProfile | 'hospital' | 'vacation' | 'travel' | 'event';

export type AlmogPushTier = 'normal' | 'light' | 'minimal';

export type LifeContext = {
  /** מזהה אירוע (חופשה, מחלה, חתונה…) — לפרומפט */
  kind: string;
  profile: LifeContextProfile;
  summary: string;
  place?: string;
  until?: string;
  push_level: 'light' | 'minimal';
  contextual_check_at?: string;
};

type LifeEventRule = {
  id: string;
  profile: LifeContextProfile;
  test: RegExp;
  summary: (ctx: { msg: string; place?: string; day?: string }) => string;
};

const CLEAR_RE =
  /(?:חזרתי|חזרנו|סיימתי|יצאתי|שוחררתי|חזרה\s+לשגרה|אני\s+בבית\s+עכשיו|מוכן\s+להמשיך|אפשר\s+(?:שוב|להתחיל)|יצאנו\s+מ)/i;

const WEEKDAY_RE =
  /(?:יום\s+)?(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)|\bב(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)\b/i;

const DURATION_DAYS_RE = /(?:עוד\s+)?(?:חודש|שבועיים|שבוע|(\d{1,2})\s*ימים?)/i;

const PLACE_RE =
  /(?:ב|ל|בתוך|אצל)\s*([א-ת][א-ת\-]{1,14}[א-ת])(?=\s|$|[,.!?])/;

const PLACE_BLOCKLIST = /שבוע|יום|חודש|מחר|היום/i;

const KNOWN_PLACES =
  /אילת|תל\s*אביב|ירושלים|חיפה|באר\s*שבע|הצפון|הדרום|חו"ל|חוץ\s*לארץ|ים\s*המלח|אירופה|יוון|תאילנד|ארה"ב|אירופה/i;

/** אות שיש אירוע חיים — גיבוי כשאין כלל ספציפי */
const GENERIC_LIFE_EVENT_RE =
  /(?:אני|אנחנו|נמצא|אהיה|יוצא|נוסע|טס|עובר|עברתי|נכנס|נכנסתי).{0,50}(?:חופש|נופש|טיול|נסיע|בחו"ל|בחול|אצל\s+(?:ה)?(?:הורים|משפחה)|בית\s*חולים|אשפוז|מאושפז|מחלה|חולה|לא\s+טוב|לא\s+בכושר|עייפ|שבוע\s+קשה|עמוס|לחוץ|דחוף|מילואים|גיוס|חתונה|לוויה|אבל|מעבר\s+דירה|לידה|יולדת|ניתוח|שבר|פציע|בדיד|דיכאון|חרדה|משבר|קשה\s+לי)/i;

const LIFE_EVENT_RULES: LifeEventRule[] = [
  {
    id: 'hospital',
    profile: 'pause',
    test: /בית\s*חולים|מאושפז|באשפוז|ניתוח|מחלקה|אשפוז/i,
    summary: ({ place }) => (place ? `בית חולים · ${place}` : 'בית חולים / אשפוז'),
  },
  {
    id: 'sick',
    profile: 'pause',
    test: /מחלה|חולה|לא\s+טוב|לא\s+בכושר|שפעת|קורונה|כאבים|שברתי|שבר|פציע|הבראה/i,
    summary: () => 'לא בכושר / מחלה',
  },
  {
    id: 'grief',
    profile: 'pause',
    test: /לוויה|הלוויה|אבל|אבדתי|נפטר|הלך\s+לעולמו|שכול/i,
    summary: () => 'תקופה רגישה',
  },
  {
    id: 'crisis',
    profile: 'pause',
    test: /משבר|התמוטטות|דיכאון|חרדה|לא\s+יוצא\s+לי|קשה\s+לי\s+מאוד|נשברתי/i,
    summary: () => 'תקופה קשה',
  },
  {
    id: 'need_space',
    profile: 'pause',
    test: /אין\s+לי\s+(?:ראש|כוח)|עמוס\s+מדי|לא\s+בזמן|לא\s+עכשיו|תן\s+לי\s+רגע/i,
    summary: () => 'צריך רגע',
  },
  {
    id: 'vacation',
    profile: 'away',
    test: /חופשה|בחופש|יוצא\s+לחופשה|בחופשה|בטיול|בנופש/i,
    summary: ({ place, day }) =>
      place ? `חופשה ב${place}` : day ? `חופשה · ${day}` : 'חופשה',
  },
  {
    id: 'travel',
    profile: 'away',
    test: /נסיעה|נוסע|טס|טיסה|בחו"ל|בחול|בדרך\s+ל|מטייל/i,
    summary: ({ place }) => (place ? `נסיעה · ${place}` : 'נסיעה'),
  },
  {
    id: 'away_family',
    profile: 'away',
    test: /אצל\s+(?:ה)?(?:הורים|משפחה|חמות|חם)|ביקור\s+אצל/i,
    summary: ({ place }) => (place ? `אצל ${place}` : 'אצל משפחה'),
  },
  {
    id: 'event',
    profile: 'away',
    test: /חתונה|אירוע|מסיבה|בר\s*מצווה|יום\s+הולדת|כנסים|ועידה/i,
    summary: ({ msg }) => trimSummary(extractEventClause(msg)),
  },
  {
    id: 'life_change',
    profile: 'busy',
    test: /מעבר\s+דירה|לידה|יולדת|(?:^|\s)גיוס(?:\s|$)|מילואים|מבחנים|בחינות|דדליין|פרויקט\s+דחוף/i,
    summary: ({ msg }) => trimSummary(extractEventClause(msg)),
  },
  {
    id: 'busy',
    profile: 'busy',
    test: /עמוס\s+מאוד|שבוע\s+עמוס|יום\s+עמוס|עומס|לחץ\s+בעבודה/i,
    summary: () => 'תקופה עמוסה',
  },
];

const WEEKDAY_TO_JS: Record<string, number> = {
  ראשון: 0,
  שני: 1,
  שלישי: 2,
  רביעי: 3,
  חמישי: 4,
  שישי: 5,
  שבת: 6,
};

function trimSummary(s: string, max = 56): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function extractEventClause(msg: string): string {
  const t = msg.replace(/^(?:היי|שלום|הי|אהלן)\s*,?\s*/i, '').trim();
  const clause = (t.split(/[.!?]/)[0] ?? t).trim();
  return clause.length >= 6 ? clause : msg.slice(0, 56);
}

function profileToPush(profile: LifeContextProfile): 'light' | 'minimal' {
  return profile === 'pause' ? 'minimal' : 'light';
}

function normalizeLegacyKind(raw: LifeContext): LifeContext {
  if (raw.profile) return raw;
  const legacyProfile: Record<string, LifeContextProfile> = {
    hospital: 'pause',
    vacation: 'away',
    travel: 'away',
    busy: 'busy',
    event: 'away',
  };
  const profile = legacyProfile[raw.kind] ?? 'busy';
  return {
    ...raw,
    profile,
    push_level: raw.push_level ?? profileToPush(profile),
  };
}

function addIsraelCalendarDays(dateKey: string, days: number): string {
  const anchor = new Date(`${dateKey}T12:00:00+02:00`);
  return israelDateKey(new Date(anchor.getTime() + days * DAY_MS));
}

function isoAtIsraelLocal(dateKey: string, hhmm: string): string {
  for (const offset of ['+03:00', '+02:00']) {
    const iso = `${dateKey}T${hhmm}:00${offset}`;
    if (israelDateKey(new Date(iso)) === dateKey) return new Date(iso).toISOString();
  }
  return new Date(`${dateKey}T${hhmm}:00+02:00`).toISOString();
}

function israelJsWeekday(now = new Date()): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: IL_TZ, weekday: 'short' }).format(now);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[name] ?? 0;
}

function nextWeekdayCheckAt(hebrewDay: string, now = new Date(), hour = 10): string | undefined {
  const target = WEEKDAY_TO_JS[hebrewDay];
  if (target == null) return undefined;
  const current = israelJsWeekday(now);
  let delta = (target - current + 7) % 7;
  if (delta === 0) delta = 7;
  const dateKey = addIsraelCalendarDays(israelDateKey(now), delta);
  return isoAtIsraelLocal(dateKey, `${String(hour).padStart(2, '0')}:00`);
}

export function parseDurationDays(msg: string): number {
  if (/חודש/.test(msg)) return 30;
  const m = msg.match(DURATION_DAYS_RE);
  if (!m) return 7;
  if (/שבועיים/.test(m[0])) return 14;
  if (/שבוע/.test(m[0]) && !/שבועיים/.test(m[0])) return 7;
  const n = Number.parseInt(m[1] ?? '', 10);
  return Number.isFinite(n) && n >= 1 && n <= 21 ? n : 7;
}

function extractPlace(msg: string): string | undefined {
  const known = msg.match(KNOWN_PLACES);
  if (known?.[0]) return known[0].replace(/\s+/g, ' ').trim();

  const m = msg.match(PLACE_RE);
  if (!m?.[1]) return undefined;
  const place = m[1].replace(/\s+/g, ' ').trim();
  if (place.length < 2 || place.length > 18) return undefined;
  if (/^(אני|הוא|היא|זה|שם|מילואים)$/i.test(place)) return undefined;
  if (PLACE_BLOCKLIST.test(place)) return undefined;
  return place;
}

function matchLifeEventRule(msg: string): LifeEventRule | null {
  for (const rule of LIFE_EVENT_RULES) {
    if (rule.test.test(msg)) return rule;
  }
  return null;
}

function buildGenericLifeContext(
  msg: string,
  now: Date,
  place?: string,
  hebrewDay?: string
): LifeContext {
  const pauseHint =
    /מחלה|לא\s+טוב|קשה|משבר|אבל|לוויה|בית\s*חולים|אשפוז|לא\s+בכושר|עייפ\s+מדי/i.test(msg);
  const profile: LifeContextProfile = pauseHint ? 'pause' : 'away';
  const summary = trimSummary(extractEventClause(msg));

  return {
    kind: pauseHint ? 'life_pause' : 'life_event',
    profile,
    summary,
    place,
    until: isoAtIsraelLocal(addIsraelCalendarDays(israelDateKey(now), parseDurationDays(msg)), '20:00'),
    push_level: profileToPush(profile),
    contextual_check_at: hebrewDay ? nextWeekdayCheckAt(hebrewDay, now) : undefined,
  };
}

export function parseLifeContextFromMessage(message: string, now = new Date()): LifeContext | null {
  const msg = message.replace(/\s+/g, ' ').trim();
  if (msg.length < 6) return null;

  const place = extractPlace(msg);
  const weekdayMatch = msg.match(WEEKDAY_RE);
  const hebrewDay = weekdayMatch?.[1];
  const contextual_check_at = hebrewDay ? nextWeekdayCheckAt(hebrewDay, now) : undefined;
  const durationDays = parseDurationDays(msg);
  const until = isoAtIsraelLocal(addIsraelCalendarDays(israelDateKey(now), durationDays), '20:00');

  const rule = matchLifeEventRule(msg);

  if (!rule && hebrewDay && /(?:אני|אהיה|נמצא|בחופש|יוצא)/.test(msg)) {
    return {
      kind: 'planned_day',
      profile: 'away',
      summary: trimSummary(place ? `${hebrewDay} · ${place}` : `יום ${hebrewDay}`),
      place,
      until,
      push_level: 'light',
      contextual_check_at,
    };
  }

  if (!rule && !GENERIC_LIFE_EVENT_RE.test(msg)) return null;

  if (!rule) {
    return buildGenericLifeContext(msg, now, place, hebrewDay);
  }

  const profile = rule.profile;
  return {
    kind: rule.id,
    profile,
    summary: trimSummary(rule.summary({ msg, place, day: hebrewDay })),
    place,
    until,
    push_level: profileToPush(profile),
    contextual_check_at: profile === 'away' ? contextual_check_at : undefined,
  };
}

export function readLifeContext(ctx: AiUserContext | null | undefined): LifeContext | null {
  const raw = ctx?.life_context;
  if (!raw || typeof raw !== 'object') return null;
  const lc = normalizeLegacyKind(raw as LifeContext);
  if (!lc.kind || !lc.summary || !lc.push_level) return null;
  if (lc.until && Date.now() > new Date(lc.until).getTime()) return null;
  return lc;
}

export function getAlmogPushTier(ctx: AiUserContext | Record<string, unknown> | null | undefined): AlmogPushTier {
  const life = readLifeContext(ctx as AiUserContext);
  if (life?.push_level === 'minimal') return 'minimal';
  if (life?.push_level === 'light') return 'light';
  return 'normal';
}

export function companionIntervalForLife(ctx: AiUserContext | null | undefined): number {
  const tier = getAlmogPushTier(ctx);
  if (tier === 'minimal') return 3;
  if (tier === 'light') return 2;
  return 1;
}

export function isLifeContextualCheckDue(
  lc: LifeContext | null | undefined,
  now = Date.now()
): boolean {
  if (!lc?.contextual_check_at) return false;
  const at = new Date(lc.contextual_check_at).getTime();
  if (!Number.isFinite(at)) return false;
  return now >= at - 5 * 60 * 1000 && now <= at + 40 * 60 * 1000;
}

export function formatLifeContextNotifyBlock(lc: LifeContext): string {
  const place = lc.place ? ` (${lc.place})` : '';
  const lines: string[] = [`אירוע/מצב: ${lc.summary}${place}.`];

  if (lc.push_level === 'minimal' || lc.profile === 'pause') {
    lines.push(
      'מינימום דחיפה: שאל אם הכול בסדר, איך רוצים להתקדם — כבד בחירה; בלי משימות/מסע/לחץ.'
    );
  } else {
    lines.push(
      `מגע חברי קל על "${lc.summary}" — עניין אישי ("איך זה?", "יש קושי?"), לא תזכורות מסע.`
    );
  }
  return lines.join(' ');
}

export function formatLifeContextChatBlock(ctx: AiUserContext | null | undefined): string {
  const lc = readLifeContext(ctx);
  if (!lc) return '';
  const tone =
    lc.profile === 'pause'
      ? 'מינימום דחיפה — רק אם הכול בסדר ואיך להתקדם כשירגישו מוכנים.'
      : 'עניין אישי באירוע/מצב — לא משימות ולא לחץ.';
  return `\nהקשר חיים: ${lc.summary}. התאם טון; אל תזכיר מערכת. ${tone}\n`;
}

export async function applyLifeContextFromUserMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  message: string
): Promise<{ stored: boolean; cleared: boolean }> {
  if (CLEAR_RE.test(message)) {
    await updateAiContext(supabase, userId, {
      life_context: null as unknown as undefined,
    });
    return { stored: false, cleared: true };
  }

  const parsed = parseLifeContextFromMessage(message);
  if (!parsed) return { stored: false, cleared: false };

  const patch: Partial<AiUserContext> = { life_context: parsed };

  if (parsed.push_level === 'minimal') {
    const days = parseDurationDays(message);
    patch.avoid_push_until = crisisCooldownUntilIso(Math.min(days * 24, 21 * 24));
  }

  await updateAiContext(supabase, userId, patch);
  return { stored: true, cleared: false };
}

export async function sendLifeContextTouch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  lc: LifeContext,
  checkInTime?: string
): Promise<{ body: string; inserted: Record<string, unknown> | null } | null> {
  const time =
    checkInTime ??
    new Date().toLocaleTimeString('en-GB', {
      timeZone: IL_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  const slot = habitSlotFromCheckInTime(time);
  const { firstName, genderInstruction } = await fetchNotifyUserProfile(admin, userId);

  const systemPrompt = `${buildCompactAlmogNotifyPrompt(
    'מגע על אירוע בחיים — לא מסע.',
    `${buildSlotDaypartPromptBlock(slot)}\n${formatLifeContextNotifyBlock(lc)}`
  )}`;

  const body = await completeEmpathyNotifyBody({
    label: 'almog_life_context',
    temperature: 0.86,
    presencePenalty: 0.5,
    frequencyPenalty: 0.52,
    maxTokens: ALMOG_NOTIFY_MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `${firstName} · ${genderInstruction} · 2–3 משפטים, אימוג'י, שאלה פתוחה.`,
      },
    ],
  });

  const emoji = lc.profile === 'pause' ? '💙' : '🌴';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await admin
    .from('notifications')
    .insert({
      user_id: userId,
      type: 'ai_message',
      title: `${firstName} ${emoji}`,
      body,
      icon_emoji: emoji,
      action_url: '/home',
      is_read: false,
      is_sent: false,
      send_at: new Date().toISOString(),
      metadata: {
        source: 'almog_life_context',
        expects_reply: true,
        life_kind: lc.kind,
        life_profile: lc.profile,
        model: AI_MODELS.empathy,
        mentor: 'almog',
      },
    })
    .select('id, user_id, type, title, archived_at, is_read, is_sent, created_at')
    .single();

  if (error) throw new Error(error.message);
  return { body, inserted: inserted as Record<string, unknown> | null };
}
