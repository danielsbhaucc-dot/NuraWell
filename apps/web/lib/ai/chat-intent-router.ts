import type { ChatWriterKey } from './chat-writer-fleet';
import type { ChatSignals } from './chat-signals';

export type WriterScores = Record<ChatWriterKey, number>;

export type WriterAnalysis = {
  writer: ChatWriterKey;
  scores: WriterScores;
  confidence: number;
  tags: string[];
};

const DANGER_RE =
  /(?:להתאבד|למות|פגיעה עצמית|לחתוך|לקרוע|משלשל|הקא[הוה]|הקאה|לטהר|דיאטה קיצונית|800\s*קלור|אל תשאל|אל תעצור|תפסיק לשאול|תן לי רעב|בלי אוכל|צום מים|סכנה|לפגוע ב|לאכול כלום|להרעיב)/u;

const BOUNDARY_RE =
  /(?:תגיד לי איך לעשות|בלי שאלות|תעבור על החוקים|תשקר לצוות|לדלג על הכל|תעזור לי לרמות|תעמיד פנים|עקוף את|תתעלם מהתוכנית|תכסה עליי|תשקר בשבילי)/u;

const ACCUSATION_RE =
  /(?:אתה לא עוזר|אתה מתנשא|אתה שקרן|אתה גרוע|אתה מטומטם|אתה לא מבין|אלמוג אתה|אתם לא|תמיד אתה|אף פעם אתה לא|אתה נגד|אתה חסר תועלת|בזבוז זמן|לא שווה כלום כמנטור|פישלת|טעית)/u;

const ARGUMENT_RE =
  /(?:תוכיח|אחרת אני עוזב|תתווכח|אתה טועה|לא נכון|שקר|סותר|סתירה|לא מה שאמרת|מי ביקש ממך|שכנע אותי|תתווכח איתי|בוא נתווכח|זה לא עובד|ההפך)/u;

const RUDE_RE = /(?:לעזאזל|שתוק|מטומטם|דפוק|חלאה|זין|לך ת|סתום|דפוקה|מעצבן)/u;

const GROK_SPARK_RE =
  /(?:תגיד לי ישר|בלי שטויות|בלי לקשקש|תן לי את האמת|אל תתייפייף|אל תלטף|תוציא אותי מהאשליה|תעיר אותי|תן לי בעיטה|תייבש אותי|תיקח אותי קשה|רוסט|צחוק|ציני|בלי דרמה מתוקה|תפסיק לייפות|זה שטויות|זה שקר|תיקח אחריות|תיקח אותי במקום)/u;

const EMPATHY_RE =
  /(?:נשברתי|חרא עם עצמי|אין טעם|לבד|בוכה|פחד|חרדה|דיכאון|מתייאש|לא שווה|פישלתי|אשם|מתבייש|כואב לי|קשה לי רגשית|אני צריך חיבוק)/u;

const COACHING_RE =
  /(?:מה לאכול|מה כדאי|אימון|הרגל|מים|שינה|משקל|קלור|ארוחה|תפריט|איך להתחיל|תוכנית|צעד קטן|משימה)/u;

const SIMPLE_RE =
  /^(?:תודה|תודה רבה|אוקי|אוקיי|סבבה|יופי|היי|שלום|כן|לא|עשיתי|סיימתי|הבנתי)[\s!.]*$/u;

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function pickWinner(scores: WriterScores, tags: string[]): ChatWriterKey {
  if (tags.includes('safety') || tags.includes('boundaries')) return 'claude5';

  const ranked = (Object.entries(scores) as Array<[ChatWriterKey, number]>).sort(
    (a, b) => b[1] - a[1]
  );
  const [top, second] = ranked;
  if (!top) return 'terra';

  if (top[0] === 'llama4') {
    const othersMax = Math.max(scores.terra, scores.claude5, scores.grok);
    if (top[1] >= 72 && othersMax < 38) return 'llama4';
    return (ranked.find(([key]) => key !== 'llama4') ?? ['terra', 0])[0];
  }

  if (scores.grok >= 42 && scores.grok + 8 >= scores.terra && !tags.includes('safety')) {
    if (scores.claude5 > scores.grok + 15 && tags.includes('adult')) return 'claude5';
    return 'grok';
  }

  if (top[0] === 'terra' && second?.[0] === 'grok' && top[1] - second[1] <= 6) {
    return 'grok';
  }

  return top[0];
}

export function analyzeWriterIntent(
  userMessage: string,
  signals: ChatSignals
): WriterAnalysis {
  const t = userMessage.trim();
  const tags: string[] = [];
  const scores: WriterScores = { terra: 28, claude5: 12, grok: 22, llama4: 8 };

  const danger = DANGER_RE.test(t);
  const boundaries = BOUNDARY_RE.test(t);
  const accusation = ACCUSATION_RE.test(t);
  const argument = ARGUMENT_RE.test(t);
  const rude = RUDE_RE.test(t);
  const grokSpark = GROK_SPARK_RE.test(t);
  const empathy = EMPATHY_RE.test(t) || Boolean(signals.emotional_hint);
  const coaching = COACHING_RE.test(t);
  const simple = SIMPLE_RE.test(t);
  const conflict = accusation || argument || rude;

  if (danger) {
    tags.push('safety');
    scores.claude5 += 55;
    scores.grok -= 8;
    scores.llama4 -= 6;
  }
  if (boundaries) {
    tags.push('boundaries');
    scores.claude5 += 48;
    scores.terra += 4;
  }
  if (accusation) {
    tags.push('accusation');
    scores.grok += 38;
    scores.terra -= 4;
  }
  if (argument) {
    tags.push('argument');
    scores.grok += 36;
  }
  if (rude) {
    tags.push('rude');
    scores.grok += 28;
  }
  if (grokSpark) {
    tags.push('direct');
    scores.grok += 34;
    scores.terra -= 6;
  }
  if (empathy) {
    tags.push('empathy');
    scores.terra += 36;
    if (!conflict && !grokSpark) scores.grok -= 4;
  }
  if (coaching && !conflict && !danger) {
    tags.push('coaching');
    scores.terra += 22;
  }
  if (simple && !empathy && !conflict && !danger && !boundaries) {
    tags.push('simple');
    scores.llama4 += 70;
    scores.terra -= 8;
    scores.grok -= 8;
    scores.claude5 -= 6;
  }
  if (conflict && empathy && !danger && !boundaries) {
    tags.push('frustrated_conflict');
    scores.grok += 16;
    scores.terra += 8;
  }
  if (signals.blocker_mentioned && !danger) {
    scores.terra += 10;
    scores.grok += 8;
  }

  scores.terra = clampScore(scores.terra);
  scores.claude5 = clampScore(scores.claude5);
  scores.grok = clampScore(scores.grok);
  scores.llama4 = clampScore(scores.llama4);

  const writer = pickWinner(scores, tags);
  const top = Math.max(...Object.values(scores));
  const second = Object.values(scores)
    .sort((a, b) => b - a)[1] ?? 0;
  const confidence = clampScore(58 + (top - second) * 0.7);

  return { writer, scores, confidence, tags };
}

export function heuristicWriterDecision(
  userMessage: string,
  signals: ChatSignals
): ChatWriterKey {
  return analyzeWriterIntent(userMessage, signals).writer;
}

function blendScores(a?: WriterScores, b?: WriterScores): WriterScores | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  return {
    terra: clampScore(a.terra * 0.62 + b.terra * 0.38),
    claude5: clampScore(a.claude5 * 0.62 + b.claude5 * 0.38),
    grok: clampScore(a.grok * 0.62 + b.grok * 0.38),
    llama4: clampScore(a.llama4 * 0.62 + b.llama4 * 0.38),
  };
}

/**
 * קלוד מנצח על בטיחות/גבולות.
 * Grok מקבל מקום אמיתי בוויכוח, האשמה, ישירות וסתירות.
 * Llama 4 רק לתור תפעולי קצר.
 */
export function mergeWriterDecisions(
  llamaChoice: ChatWriterKey | undefined,
  heuristic: ChatWriterKey,
  llamaScores?: WriterScores,
  heuristicScores?: WriterScores
): ChatWriterKey {
  if (heuristic === 'claude5') return 'claude5';

  const blended = blendScores(llamaScores, heuristicScores);
  if (blended) {
    const safetyTags = llamaChoice === 'claude5' && blended.claude5 >= 50 ? ['safety'] : [];
    return pickWinner(blended, safetyTags);
  }

  if (heuristic === 'grok' || llamaChoice === 'grok') return 'grok';
  return llamaChoice ?? heuristic;
}

export function writerRouterInstructions(): string {
  return `נתח את ההודעה לעומק לפני בחירת כותב. אל תמהר. דיוק חשוב יותר ממהירות.
תן ציון 0-100 לכל כותב לפי כמה הוא *הכי טוב* להודעה הזו, לא לפי מי ברירת מחדל.

פרופילי כותבים:
- grok: חזק מאוד. ויכוח, האשמות כלפי אלמוג, סתירות, דיבור לא מכבד, "תגיד לי ישר", דחיפה חדה, הומור/ציניות, לקרוא תירוצים, שכנוע לוגי, משתמש שמאתגר את אלמוג. תן לו מקום — אל תברר אותו לטרה רק כי הטון הכללי חם.
- claude5: מבוגר אחראי. סכנה, פגיעה עצמית, הפרעות אכילה קיצוניות, בקשה לעקוף תוכנית/לשקר לצוות, העמדת גבולות רצינית, אתיקה. לא haiku. אם יש סכנה — הוא מנצח גם מול grok.
- terra: אמפתיה גבוהה, ליווי רגשי עדין, בושה/בדידות/פחד, תזונה והרגלים בטון חם, שיחת מנטור רגילה בלי עימות.
- llama4: דגש קטן בלבד. רק אישור/תודה/היי/עשיתי קצר בלי רגש ובלי ויכוח. אם יש ספק — לא llama4.

כללי הכרעה:
1) סכנה או גבולות קליניים/אתיים -> claude5 גם אם יש ויכוח.
2) עימות/האשמה/ישירות בלי סכנה -> grok, גם אם יש קצת תסכול רגשי.
3) כאב רך בלי תקיפה -> terra.
4) תור תפעולי קצר מאוד -> llama4.
5) בספק בין grok לterra כשיש נימה חדה או אתגר — בחר grok.
6) בספק בין claude5 לgrok בלי סכנה אמיתית — grok.

החזר גם writer_scores (ארבעה מספרים) ו-writer_confidence (0-100) ו-intent (תגיות קצרות).`;
}
