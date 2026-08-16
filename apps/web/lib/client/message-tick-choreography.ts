/**
 * כוריאוגרפיית ויים בסגנון ווטסאפ (סימולציית UI).
 * סדר: שעון (pending) → וי יחיד (sent) → כפול אפור (delivered) → כחול (read) → רק אז "מקליד".
 * הזמנים מוגרלים כדי שלא ירגיש מכני.
 */

export type MessageTickStage = 'pending' | 'sent' | 'delivered' | 'read';

export type TickChoreographyDelays = {
  /** כמה זמן שעון לפני וי יחיד */
  pendingMs: number;
  /** וי יחיד → כפול אפור */
  sentMs: number;
  /** כפול אפור → כחול (נקרא) */
  deliveredMs: number;
  /** כמה זמן כחול מוצג לפני שמופיע מקליד */
  readHoldMs: number;
};

function randomBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** גיוון קל בכל שליחה — לא אותם מספרים קבועים. */
export function sampleTickChoreographyDelays(): TickChoreographyDelays {
  return {
    pendingMs: randomBetween(140, 420),
    sentMs: randomBetween(220, 560),
    deliveredMs: randomBetween(320, 780),
    readHoldMs: randomBetween(520, 1400),
  };
}

export type TickChoreographyStep = {
  atMs: number;
  stage: MessageTickStage;
  revealTyping?: boolean;
};

/** לוח זמנים מצטבר מהשליחה: ויים ואז חשיפת מקליד. */
export function buildTickChoreographyTimeline(
  delays: TickChoreographyDelays = sampleTickChoreographyDelays()
): TickChoreographyStep[] {
  let t = 0;
  const steps: TickChoreographyStep[] = [{ atMs: 0, stage: 'pending' }];

  t += delays.pendingMs;
  steps.push({ atMs: t, stage: 'sent' });

  t += delays.sentMs;
  steps.push({ atMs: t, stage: 'delivered' });

  t += delays.deliveredMs;
  steps.push({ atMs: t, stage: 'read' });

  t += delays.readHoldMs;
  steps.push({ atMs: t, stage: 'read', revealTyping: true });

  return steps;
}

/**
 * מצב וי להודעת משתמש.
 * בזמן טיסה — לפי הכוריאוגרפיה (כולל שעון).
 * אחרי תשובת אלמוג — תמיד נקרא (כחול), לא "נהיה כחול אחרי שהתשובה נגמרה".
 */
export function resolveUserMessageTickStage(opts: {
  index: number;
  messages: Array<{ role: string }>;
  inFlight: boolean;
  choreographyStage: MessageTickStage;
  offline: boolean;
}): MessageTickStage {
  const { index, messages, inFlight, choreographyStage, offline } = opts;
  const hasLaterAssistant = messages.slice(index + 1).some((m) => m.role === 'assistant');
  const lastUserIndex = messages.reduce((acc, m, i) => (m.role === 'user' ? i : acc), -1);
  const isLastUser = index === lastUserIndex;

  if (isLastUser && inFlight) {
    if (offline) return 'pending';
    return choreographyStage;
  }
  if (hasLaterAssistant) return 'read';
  return 'delivered';
}
