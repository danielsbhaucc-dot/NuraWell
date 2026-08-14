import type { ChatWriterKey } from './chat-writer-fleet';
import type { ChatSignals } from './chat-signals';

const DANGER_RE =
  /(?:להתאבד|למות|פגיעה עצמית|לחתוך|לקרוע|משלשל|הקא[הוה]|הקאה|לטהר|דיאטה קיצונית|800\s*קלור|אל תשאל|אל תעצור|תפסיק לשאול|תן לי רעב|בלי אוכל|צום מים|סכנה|לפגוע ב)/u;

const BOUNDARY_RE =
  /(?:תגיד לי איך לעשות|בלי שאלות|תעבור על החוקים|תשקר לצוות|לדלג על הכל|תעזור לי לרמות|תעמיד פנים|עקוף את|תתעלם מהתוכנית)/u;

const ACCUSATION_RE =
  /(?:אתה לא עוזר|אתה מתנשא|אתה שקרן|אתה גרוע|אתה מטומטם|אתה לא מבין|אלמוג אתה|אתם לא|תמיד אתה|אף פעם אתה לא|אתה נגד)/u;

const ARGUMENT_RE =
  /(?:תוכיח|אחרת אני עוזב|תתווכח|אתה טועה|לא נכון|שקר|סותר|סתירה|לא מה שאמרת|מי ביקש ממך)/u;

const RUDE_RE = /(?:לעזאזל|שתוק|מטומטם|דפוק|חלאה|זין|לך ת|סתום)/u;

const EMPATHY_RE =
  /(?:נשברתי|חרא עם עצמי|אין טעם|לבד|בוכה|פחד|חרדה|דיכאון|מתייאש|לא שווה|פישלתי|אשם|מתבייש)/u;

const SIMPLE_RE =
  /^(?:תודה|תודה רבה|אוקי|אוקיי|סבבה|יופי|היי|שלום|כן|לא|עשיתי|סיימתי|הבנתי)[\s!.]*$/u;

export function heuristicWriterDecision(
  userMessage: string,
  signals: ChatSignals
): ChatWriterKey {
  const t = userMessage.trim();
  const danger = DANGER_RE.test(t);
  const boundaries = BOUNDARY_RE.test(t);
  const accusation = ACCUSATION_RE.test(t);
  const argument = ARGUMENT_RE.test(t);
  const rude = RUDE_RE.test(t);
  const empathy = EMPATHY_RE.test(t) || Boolean(signals.emotional_hint);
  const conflict = accusation || argument || rude;

  if (danger || boundaries) return 'claude5';
  if (conflict && empathy) return 'claude5';
  if (conflict) return 'grok';
  if (SIMPLE_RE.test(t) && !empathy) return 'llama4';
  if (empathy) return 'terra';
  return 'terra';
}

/**
 * קלוד מנצח תמיד על בטיחות/גבולות.
 * GROK לוויכוח/האשמה בלי סכנה.
 * אחרת נשארים עם בחירת Llama 4.
 */
export function mergeWriterDecisions(
  llamaChoice: ChatWriterKey | undefined,
  heuristic: ChatWriterKey
): ChatWriterKey {
  if (heuristic === 'claude5') return 'claude5';
  if (llamaChoice === 'claude5') return 'claude5';
  if (heuristic === 'grok' && llamaChoice !== 'terra') return llamaChoice ?? 'grok';
  if (heuristic === 'grok' && llamaChoice === 'terra') return 'grok';
  return llamaChoice ?? heuristic;
}

export function writerRouterInstructions(): string {
  return `בחר גם כותב לתשובה (writer). טון כללי: GPT Terra.
כללים — איכות לפני מהירות:
- terra: ברירת מחדל, אמפתיה גבוהה, ליווי, תזונה, הרגלים, שיחה רגילה.
- claude5: העמדת גבולות רצינית, מבוגר אחראי, סכנה, בקשות מסוכנות, רמאות/עקיפת תוכנית, האשמות שמערבבות סכנה. לא haiku ולא מודל חלש.
- grok: ויכוח, האשמות כלפי אלמוג, סתירות, דיבור לא מכבד — בלי סכנה ובלי גבולות קליניים.
- llama4: תור קצר/תפעולי/אישור/תודה/המשך פשוט שבו Llama 4 יעיל יותר.

אם יש גם ויכוח וגם סכנה/גבולות -> claude5.
החזר בשדה writer אחד מהערכים: terra | claude5 | grok | llama4.`;
}
