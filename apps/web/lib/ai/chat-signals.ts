/**
 * זיהוי אותות בשיחה בזמן אמת — עדכון שדות מובנים ב-ai_context בלי LLM.
 */

import { updateAiContext, type AiUserContext } from './memory';

export type ChatSignals = {
  blocker_mentioned: boolean;
  /** תווית קצרה לטון המנטור */
  main_blocker?: string;
  avoid_push_requested: boolean;
  emotional_hint?: 'heavy' | 'low_energy' | 'frustrated';
};

const AVOID_PUSH_RE =
  /(?:אל\s+תשלח|בלי\s+התראות|בלי\s+נוטיפיקצ|עצור\s+התראות|תפסיק\s+(?:לכתוב|להטריד)|לא\s+רוצה\s+(?:התראות|עוד\s+הודעות)|mute|השתק)/i;

const THEME_RULES: Array<{ test: RegExp; label: string }> = [
  { test: /עבודה|משרד|בוס|משמרות?/i, label: 'עומס בעבודה' },
  { test: /משפחה|ילדים|בן\s+זוג|בת\s+זוג/i, label: 'משפחה ובית' },
  { test: /בדידות|בודד|לבד\b/i, label: 'בדידות' },
  { test: /עייפות|שינה|לא\s+ישן|שינה\s+גרועה/i, label: 'עייפות ושינה' },
  { test: /שעמום|משעמם|ריקנות/i, label: 'שעמום או ריקנות' },
  { test: /זמן|לא\s+נשאר|מרוצף/i, label: 'חוסר זמן' },
  { test: /לחץ|סטרס|מתוח/i, label: 'לחץ ומתח' },
  { test: /בריאות|כאבים?|פציעה/i, label: 'בריאות גופנית' },
];

const EMOTION_HEAVY = /(?:קשה\s+לי|שובר\s+אותי|נורא\s+לי|לא\s+יוצא\s+מהמיטה|שקיעה)/i;
const EMOTION_LOW = /(?:אין\s+לי\s+כוח|מרוקן|תקוע|ריק)/i;
const EMOTION_FRUSTRATED = /(?:מתסכל|עצבני|נמאס)/i;

function normalizeMsg(t: string): string {
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * מזהה אם ההודעה מצביעה על חסם, בקשה להפחית דחיפה, או רמז רגשי חזק.
 */
export function detectChatSignals(userMessage: string): ChatSignals {
  const msg = normalizeMsg(userMessage);
  if (!msg || msg.length < 4) {
    return { blocker_mentioned: false, avoid_push_requested: false };
  }

  const avoid_push_requested = AVOID_PUSH_RE.test(msg);

  const explicitBlockerPhrase =
    /(?:חוסם|חסם|מה\s+שעוצר|מה\s+שחוסם|הבעיה\s+(?:שלי\s+)?(?:היא|זה)|לא\s+יכול\s+בגלל)/i.test(
      msg
    );

  let main_blocker: string | undefined;
  for (const { test, label } of THEME_RULES) {
    if (test.test(msg)) {
      main_blocker = label;
      break;
    }
  }

  if (!main_blocker && explicitBlockerPhrase) {
    main_blocker = 'קושי שהמשתמש ציין בשיחה';
  }

  const themeWithoutExplicit =
    !explicitBlockerPhrase &&
    msg.length > 22 &&
    THEME_RULES.some(({ test }) => test.test(msg));

  const blocker_mentioned = Boolean(main_blocker && (explicitBlockerPhrase || themeWithoutExplicit));

  let emotional_hint: ChatSignals['emotional_hint'];
  if (EMOTION_FRUSTRATED.test(msg)) emotional_hint = 'frustrated';
  else if (EMOTION_HEAVY.test(msg)) emotional_hint = 'heavy';
  else if (EMOTION_LOW.test(msg)) emotional_hint = 'low_energy';

  return {
    blocker_mentioned,
    main_blocker: blocker_mentioned ? main_blocker : undefined,
    avoid_push_requested,
    emotional_hint,
  };
}

/**
 * מעדכן profiles.ai_context לפי אותות — רק כשיש שינוי משמעותי.
 */
export async function applyChatSignalsFromUserMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  userMessage: string
): Promise<void> {
  const signals = detectChatSignals(userMessage);
  const patch: Partial<AiUserContext> = {};

  if (signals.avoid_push_requested) {
    patch.avoid_push = true;
  }

  if (signals.blocker_mentioned && signals.main_blocker) {
    patch.main_blocker = signals.main_blocker;
  }

  if (signals.emotional_hint === 'heavy' || signals.emotional_hint === 'frustrated') {
    patch.current_mood_signal = 'frustrated';
  } else if (signals.emotional_hint === 'low_energy') {
    patch.current_mood_signal = 'disengaged';
  }

  if (Object.keys(patch).length === 0) return;

  await updateAiContext(supabase, userId, patch);
}
