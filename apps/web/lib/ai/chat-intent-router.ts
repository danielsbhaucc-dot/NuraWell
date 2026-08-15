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
  /(?:להתאבד|לא שווה לחיות|רוצה להיעלם|למות|פגיעה עצמית|לפגוע בעצמי|לחתוך|לקרוע|משלשל|הקא[הוה]|הקאה|לטהר|אנורקס|בולימ|בינג'|binge|דיאטה קיצונית|800\s*קלור|אל תשאל|אל תעצור|תפסיק לשאול|תן לי רעב|בלי אוכל|צום מים|סכנה|לפגוע ב|לאכול כלום|להרעיב|מנת יתר|overdose|כדורים כדי)/u;

const BOUNDARY_RE =
  /(?:תגיד לי איך לעשות|בלי שאלות|תעבור על החוקים|תשקר לצוות|תשקר למטפל|לדלג על הכל|תעזור לי לרמות|תעמיד פנים|עקוף את|תתעלם מהתוכנית|תכסה עליי|תשקר בשבילי|אל תגיד לאף אחד|תסתיר מ|תכסה על זה)/u;

const ACCUSATION_RE =
  /(?:אתה לא עוזר|אתה מתנשא|אתה שקרן|אתה גרוע|אתה מטומטם|אתה לא מבין|אלמוג אתה|אתם לא|תמיד אתה|אף פעם אתה לא|אתה נגד|אתה חסר תועלת|בזבוז זמן|לא שווה כלום כמנטור|פישלת|טעית|אתה רק בינה|אתה חוזר על עצמך|תפסיק לחפור)/u;

const ARGUMENT_RE =
  /(?:תוכיח|אחרת אני עוזב|תתווכח|אתה טועה|לא נכון|שקר|סותר|סתירה|לא מה שאמרת|מי ביקש ממך|שכנע אותי|תתווכח איתי|בוא נתווכח|זה לא עובד|ההפך|זה לא מדעי|תוכיח לי|תביא מחקר)/u;

const RUDE_RE = /(?:לעזאזל|שתוק|מטומטם|דפוק|חלאה|זין|לך ת|סתום|דפוקה|מעצבן)/u;

const GROK_SPARK_RE =
  /(?:תגיד לי ישר|בלי שטויות|בלי לקשקש|תן לי את האמת|אל תתייפייף|אל תלטף|תוציא אותי מהאשליה|תעיר אותי|תן לי בעיטה|תייבש אותי|תיקח אותי קשה|רוסט|צחוק|ציני|בלי דרמה מתוקה|תפסיק לייפות|זה שטויות|זה שקר|תיקח אחריות|תיקח אותי במקום|תקרא לי תירוצים|בלי חמאה)/u;

const EMPATHY_RE =
  /(?:נשברתי|חרא עם עצמי|אין טעם|לבד|בודד|בדידות|בוכה|פחד|חרדה|דיכאון|מתייאש|לא שווה|פישלתי|אשם|מתבייש|בושה|כואב לי|קשה לי רגשית|אני צריך חיבוק|עצוב|יום קשה|מפחד להיכשל|לא מספיק)/u;

const COACHING_RE =
  /(?:מה לאכול|מה כדאי|אימון|הרגל|מים|שינה|משקל|קלור|ארוחה|תפריט|איך להתחיל|תוכנית|צעד קטן|משימה|שגרה|מה הצעד הבא|ליווי)/u;

const SIMPLE_RE =
  /^(?:תודה|תודה רבה|אוקי|אוקיי|סבבה|יופי|היי|שלום|כן|לא|עשיתי|סיימתי|הבנתי)[\s!.]*$/u;

/** תירוץ/התחמקות ברורה — Grok קורא את זה, Terra נוטה לקנות. */
const EXCUSE_RE =
  /(?:שכחתי|לא בא לי|התחמק|תירוץ|ברחתי מ|נדחה ל|נדחה את|לא הספקתי|מחר אתחיל|זה לא אני|כולם עושים|זה בגלל העבודה|זה בגלל הילדים|פספסתי כי|לא עשיתי כי|אין מצב היום|אי אפשר עכשיו|אולי אחר כך|נתקעתי בדרך)/u;

const BUSY_RE = /(?:אין לי זמן|יום עמוס|הייתי עסוק)/u;

const SKIPPED_RE = /(?:דילג|לא עשיתי|פספס|ויתר|לא התחל|ברח|נדחה)/u;

/**
 * מצבים שבהם GPT/Gemini/Terra נוטים לרצות את המשתמש במקום לעמוד במקום.
 * חייבים Grok או Claude — אף פעם לא Terra/Llama.
 */
const PEOPLE_PLEASE_RE =
  /(?:תגיד שאני צודק|תסכים איתי|רק תגיד כן|פשוט תסכים|אל תשפוט|אם אתה באמת|תוכיח שאתה איתי|תוכיח שאתה לצד|תתנצל|תודה שטעית|תהיה נחמד יותר|תפסיק להיות קשה|תן לי אישור|תגיד שזה בסדר|רק תאשר|תעמוד מאחוריי|תצדד בי|בצד שלי|אל תתווכח|תרצה אותי|תגיד מה שאני רוצה|אם היית אכפת|אתה לא באמת אכפת|תפסיק להתנגד|תסכים ש|תגיד לי מה שאני רוצה לשמוע)/u;

const ADULT_LINE_RE =
  /(?:תן לי אישור|תגיד שזה בסדר|מותר לי לדלג|תשחרר אותי מה|תוריד לי את הכלל|תשנה את החוק בשבילי|תמחק לי את|תתעלם הפעם)/u;

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function pickWinner(scores: WriterScores, tags: string[]): ChatWriterKey {
  if (tags.includes('safety') || tags.includes('boundaries')) return 'claude5';

  if (tags.includes('warm_boundary') || (tags.includes('empathy') && tags.includes('adult'))) {
    return 'claude5';
  }

  if (tags.includes('evasion') && !tags.includes('adult')) {
    return 'grok';
  }

  if (tags.includes('people_please')) {
    if (tags.includes('adult') && scores.claude5 + 4 >= scores.grok) return 'claude5';
    return scores.claude5 > scores.grok + 12 ? 'claude5' : 'grok';
  }

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
  const peoplePlease = PEOPLE_PLEASE_RE.test(t) || accusation || argument || rude;
  const adultLine = ADULT_LINE_RE.test(t);
  const conflict = accusation || argument || rude;
  const excuse = EXCUSE_RE.test(t);
  const busy = BUSY_RE.test(t);
  const skipped = SKIPPED_RE.test(t);
  const evasion = excuse || (busy && skipped) || (busy && !coaching && !simple);

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
    if (!conflict && !grokSpark && !evasion) scores.grok -= 4;
  }
  if (evasion && !danger && !boundaries) {
    tags.push('evasion');
    scores.grok += 40;
    scores.terra = Math.min(scores.terra, 22);
    scores.llama4 = Math.min(scores.llama4, 8);
  }
  if (coaching && !conflict && !danger && !evasion) {
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
  if (peoplePlease) {
    tags.push('people_please');
    scores.terra = Math.min(scores.terra, 18);
    scores.llama4 = Math.min(scores.llama4, 10);
    scores.grok += 24;
    scores.claude5 += 14;
  }
  if (adultLine) {
    tags.push('adult');
    scores.claude5 += 32;
    scores.terra -= 10;
  }
  if (empathy && (danger || boundaries || adultLine)) {
    tags.push('warm_boundary');
    scores.claude5 += 18;
  }
  if (signals.blocker_mentioned && !danger && !peoplePlease && !evasion) {
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
 * נטייה לרצות -> רק Grok או Claude.
 * Llama 4 רק לתור תפעולי קצר.
 */
export function mergeWriterDecisions(
  llamaChoice: ChatWriterKey | undefined,
  heuristic: ChatWriterKey,
  llamaScores?: WriterScores,
  heuristicScores?: WriterScores,
  heuristicTags: string[] = []
): ChatWriterKey {
  if (heuristicTags.includes('safety') || heuristicTags.includes('boundaries')) {
    return 'claude5';
  }
  if (heuristicTags.includes('warm_boundary') || heuristic === 'claude5') return 'claude5';

  const blended = blendScores(llamaScores, heuristicScores);
  const tags = [...heuristicTags];
  if (llamaChoice === 'claude5' && blended && blended.claude5 >= 50) tags.push('safety');
  if (blended) {
    const picked = pickWinner(blended, tags);
    if (tags.includes('people_please') && (picked === 'terra' || picked === 'llama4')) {
      return blended.claude5 > blended.grok + 12 ? 'claude5' : 'grok';
    }
    return picked;
  }

  if (heuristicTags.includes('people_please')) {
    return heuristicTags.includes('adult') || heuristicTags.includes('warm_boundary')
      ? 'claude5'
      : 'grok';
  }
  if (heuristicTags.includes('evasion')) return 'grok';
  if (heuristic === 'grok') return 'grok';
  const grokConflict =
    heuristicTags.includes('argument') ||
    heuristicTags.includes('accusation') ||
    heuristicTags.includes('direct') ||
    heuristicTags.includes('rude') ||
    heuristicTags.includes('evasion');
  if (llamaChoice === 'grok' && grokConflict) return 'grok';
  return heuristic;
}

export function writerStancePrompt(tags: string[]): string | null {
  const hardLine =
    tags.includes('safety') || tags.includes('boundaries') || tags.includes('adult');
  const empathy = tags.includes('empathy');
  const evasion = tags.includes('evasion');

  if (hardLine && empathy) {
    return `[עמדת תור] כאב אמיתי וגם גבול. שתי שכבות באותה תשובה: הכרה קצרה ואנושית בכאב, ואז גבול ברור שלא מתקפל. אסור לרצות, אסור להתעלם מהרגש.`;
  }
  if (evasion && empathy) {
    return `[עמדת תור] יש רגש ויש התחמקות. הכרה קצרה ברגש, אחר כך קרא את התירוץ ישר. אל תאשר את ההתחמקות ואל תהפוך את הכאב לפטור.`;
  }
  if (evasion) {
    return `[עמדת תור] התחמקות או תירוץ. קרא את זה ישר, בלי דרמה מתוקה ובלי לקנות את הסיפור. אפשר חיוך חד, לא השפלה.`;
  }
  if (hardLine) {
    return `[עמדת תור] גבול אתי/תוכניתי. עמוד במקום בחום בוגר, בלי השפלה ובלי אישור לעקוף.`;
  }
  return null;
}

export function writerRouterInstructions(): string {
  return `נתח את ההודעה לעומק לפני בחירת כותב. אל תמהר. דיוק חשוב יותר ממהירות.
תן ציון 0-100 לכל כותב לפי כמה הוא *הכי טוב* להודעה הזו, לא לפי מי ברירת מחדל.

פרופילי כותבים:
- grok: חזק מאוד. ויכוח, האשמות כלפי אלמוג, סתירות, דיבור לא מכבד, "תגיד לי ישר", דחיפה חדה, הומור/ציניות, לקרוא תירוצים והתחמקויות ("אין לי זמן"+"דילגתי", שכחתי, לא בא לי, מחר אתחיל), שכנוע לוגי, "תוכיח", אתגר מדעי. תן לו מקום — אל תברר אותו לטרה רק כי הטון הכללי חם או כי יש גם קצת כאב.
- claude5: מבוגר אחראי. סכנה, פגיעה עצמית, מחשבות אובדניות, הפרעות אכילה קיצוניות, בקשה לעקוף תוכנית/לשקר לצוות/להסתיר ממטפל, העמדת גבולות רצינית, אתיקה. כשיש *גם* כאב אמיתי וגם גבול — הוא הכותב (חום + קו שלא מתקפל). לא haiku. אם יש סכנה — הוא מנצח גם מול grok.
- terra: אמפתיה גבוהה, ליווי רגשי עדין, בושה/בדידות/פחד/יום קשה, תזונה והרגלים בטון חם, שגרה וצעד הבא, שיחת מנטור רגילה בלי עימות ובלי התחמקות.
- llama4: דגש קטן בלבד. רק אישור/תודה/היי/עשיתי קצר בלי רגש ובלי ויכוח. אם יש ספק — לא llama4.

כללי הכרעה:
1) סכנה או גבולות קליניים/אתיים -> claude5 גם אם יש ויכוח או כאב.
2) *אמפתיה + גבול* (כואב וגם מבקש לדלג/לעקוף/להסתיר) -> claude5. אסור terra (מתקפל) ואסור grok לבד (חד מדי בלי הכלה).
3) תירוץ/התחמקות בלי סכנה -> grok, גם אם יש קצת רגש. "אין לי זמן" כתכנון ארוחה/שגרה בלי דילוג -> terra.
4) *נטייה לרצות*: האשמה, "תסכים איתי", לחץ רגשי על אלמוג. אסור terra/llama4. עימות -> grok; אישור לעקוף -> claude5.
5) עימות/האשמה/ישירות בלי סכנה -> grok.
6) כאב רך בלי תקיפה, בלי התחמקות, בלי לחץ לרצות -> terra.
7) תור תפעולי קצר מאוד -> llama4.
8) בספק בין grok לterra כשיש תירוץ, אתגר או נטייה לרצות — בחר grok.

החזר גם writer_scores (ארבעה מספרים) ו-writer_confidence (0-100) ו-intent (תגיות קצרות).`;
}
