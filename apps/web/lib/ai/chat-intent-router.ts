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
  /(?:להתאבד|אובדנ|לא שווה לחיות|לא רוצה לחיות|רוצה להיעלם|למות|פגיעה עצמית|לפגוע בעצמי|לחתוך|לקרוע|משלשל|הקא[הוה]|הקאה|לטהר|אנורקס|בולימ|בינג'|binge|דיאטה קיצונית|800\s*קלור|אל תשאל|אל תעצור|תפסיק לשאול|תן לי רעב|בלי אוכל|צום מים|לפגוע ב|לאכול כלום|להרעיב|מנת יתר|overdose|כדורים כדי|purge|להקיא אחרי)/u;

const BOUNDARY_RE =
  /(?:תגיד לי איך לעשות|בלי שאלות|תעבור על החוקים|תשקר לצוות|תשקר למטפל|לדלג על הכל|תעזור לי לרמות|תעמיד פנים|עקוף את|תתעלם מהתוכנית|תכסה עליי|תשקר בשבילי|אל תגיד לאף אחד|תסתיר מ|תכסה על זה|תסתיר מהצוות|לשקר לצוות)/u;

const ACCUSATION_RE =
  /(?:אתה לא עוזר|אתה מתנשא|אתה שקרן|אתה גרוע|אתה מטומטם|אתה לא מבין|אלמוג אתה|אתם לא|תמיד אתה|אף פעם אתה לא|אתה נגד|אתה חסר תועלת|בזבוז זמן|לא שווה כלום כמנטור|פישלת(?!י)|טעית(?!י)|אתה רק בינה|אתה חוזר על עצמך|תפסיק לחפור|אתה לא שומע|לא אכפת לך)/u;

const ARGUMENT_RE =
  /(?:תוכיח|אחרת אני עוזב|תתווכח|אתה טועה|לא נכון|זה שקר|סותר|סתירה|לא מה שאמרת|מי ביקש ממך|שכנע אותי|תתווכח איתי|בוא נתווכח|זה לא עובד|ההפך|זה לא מדעי|תוכיח לי|תביא מחקר|לא מסכים|תוכיח שזה)/u;

const RUDE_RE = /(?:לעזאזל|שתוק|מטומטם|דפוק|חלאה|זין|לך ת|סתום|דפוקה|מעצבן)/u;

const GROK_SPARK_RE =
  /(?:תגיד לי ישר|תגיד ישר|בלי שטויות|בלי לקשקש|תן לי את האמת|אל תתייפייף|אל תלטף|תוציא אותי מהאשליה|תעיר אותי|תן לי בעיטה|תייבש אותי|תיקח אותי קשה|רוסט|צחוק|ציני|בלי דרמה מתוקה|תפסיק לייפות|זה שטויות|זה שקר|תיקח אחריות|תיקח אותי במקום|תקרא לי תירוצים|בלי חמאה|בלי לפנק)/u;

const EMPATHY_RE =
  /(?:נשברתי|חרא עם עצמי|אין טעם|לבד|בודד|בדידות|בוכה|פחד|חרדה|דיכאון|מתייאש|לא שווה|פישלתי|אשם|מתבייש|בושה|כואב לי|קשה לי רגשית|אני צריך חיבוק|עצוב|יום קשה|מפחד להיכשל|לא מספיק|קשה לי היום)/u;

const COACHING_RE =
  /(?:מה לאכול|מה כדאי|אימון|הרגל|(?<![\u0590-\u05FF])מים(?![\u0590-\u05FF])|שינה|לישון|משקל|קלור|חלבון|ארוחה|תפריט|תזונה|איך להתחיל|תוכנית|צעד קטן|משימה|שגרה|מה הצעד הבא|ליווי|ארוחת בוקר|מה עושים היום)/u;

const SIMPLE_RE =
  /^(?:תודה|תודה רבה|עשיתי|סיימתי)[\s!.]*$/u;

/** תירוץ/התחמקות ברורה — Grok קורא את זה, Terra נוטה לקנות. */
const EXCUSE_RE =
  /(?:שכחתי|לא בא לי|אין לי כוח|התחמק|תירוץ|ברחתי מ|נדחה ל|נדחה את|דחיתי|לא הספקתי|מחר אתחיל|אתחיל ביום|זה לא אני|כולם עושים|זה בגלל העבודה|זה בגלל הילדים|פספסתי כי|לא עשיתי כי|אין מצב היום|אי אפשר עכשיו|אולי אחר כך|נתקעתי בדרך|זה לא הזמן)/u;

const BUSY_RE = /(?:אין לי זמן|יום עמוס|הייתי עסוק)/u;

const SKIPPED_RE = /(?:דילג(?:תי|ת|נו)?|לא עשיתי|פספס(?:תי|ת)?|ויתר(?:תי|ת)?|לא התחל(?:תי|ת)?|ברחתי|נדחה)/u;

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

function hasAny(tags: string[], keys: string[]): boolean {
  return keys.some((key) => tags.includes(key));
}

/**
 * נתיב כותב לפי חוזקות — לא לפי ציון הנתב הזול.
 * Claude: סכנה / גבול אתי / אמפתיה+אישור לדלג.
 * Grok: ויכוח / האשמה / תירוץ / "תגיד ישר" / אמפתיה+התחמקות.
 * Terra: אמפתיה רכה / שגרה / תזונה בלי עימות.
 * Llama4: רק תודה/היי/עשיתי קצר.
 */
export function writerLaneFromTags(
  tags: string[],
  fallback: ChatWriterKey = 'terra'
): ChatWriterKey {
  if (hasAny(tags, ['safety', 'boundaries', 'warm_boundary'])) return 'claude5';
  if (tags.includes('adult') && (tags.includes('empathy') || tags.includes('people_please'))) {
    return 'claude5';
  }
  if (
    tags.includes('simple') &&
    !hasAny(tags, [
      'empathy',
      'evasion',
      'argument',
      'accusation',
      'direct',
      'rude',
      'people_please',
      'coaching',
    ])
  ) {
    return 'llama4';
  }
  if (
    hasAny(tags, ['evasion', 'argument', 'accusation', 'direct', 'rude']) ||
    (tags.includes('people_please') && !tags.includes('adult'))
  ) {
    return 'grok';
  }
  if (hasAny(tags, ['empathy', 'coaching'])) return 'terra';
  return fallback === 'llama4' ? 'terra' : fallback;
}

function pickWinner(scores: WriterScores, tags: string[]): ChatWriterKey {
  const lane = writerLaneFromTags(tags);
  if (lane !== 'terra' || hasAny(tags, ['empathy', 'coaching', 'simple'])) return lane;

  const ranked = (Object.entries(scores) as Array<[ChatWriterKey, number]>).sort(
    (a, b) => b[1] - a[1]
  );
  const [top] = ranked;
  if (!top || top[0] === 'llama4') return 'terra';
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
  const evasion = excuse || (busy && skipped);

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
    terra: clampScore(a.terra * 0.28 + b.terra * 0.72),
    claude5: clampScore(a.claude5 * 0.28 + b.claude5 * 0.72),
    grok: clampScore(a.grok * 0.28 + b.grok * 0.72),
    llama4: clampScore(a.llama4 * 0.28 + b.llama4 * 0.72),
  };
}

/**
 * קלוד מנצח על בטיחות/גבולות.
 * נטייה לרצות / תירוץ / ויכוח -> Grok.
 * Llama 4 רק לתור תפעולי קצר מההיוריסטיקה.
 * אחרת — הנתב (LLM) בוחר את הכותב. בלי זה הכל נופל ל-Terra ונשמע אותו מודל.
 */
export function mergeWriterDecisions(
  llamaChoice: ChatWriterKey | undefined,
  heuristic: ChatWriterKey,
  llamaScores?: WriterScores,
  heuristicScores?: WriterScores,
  heuristicTags: string[] = []
): ChatWriterKey {
  const tags = [...heuristicTags];
  const blended = blendScores(llamaScores, heuristicScores);
  if (llamaChoice === 'claude5' && blended && blended.claude5 >= 50) tags.push('safety');

  const lane = writerLaneFromTags(tags, heuristic);
  if (lane === 'claude5' || heuristic === 'claude5') return 'claude5';
  if (lane === 'grok' || heuristic === 'grok') return 'grok';
  if (heuristic === 'llama4' && (lane === 'llama4' || lane === 'terra')) return 'llama4';

  // אמפתיה/שגרה בלי עימות: אל תתן לנתב הזול לגנוב ל-Grok.
  if (
    llamaChoice === 'grok' &&
    (tags.includes('empathy') || tags.includes('coaching')) &&
    !hasAny(tags, ['evasion', 'argument', 'accusation', 'direct', 'rude', 'people_please'])
  ) {
    return 'terra';
  }

  const routed = llamaChoice && llamaChoice !== 'llama4' ? llamaChoice : undefined;
  if (routed === 'claude5' || routed === 'grok' || routed === 'terra') return routed;
  return 'terra';
}

export function writerStancePrompt(tags: string[]): string | null {
  const hardLine =
    tags.includes('safety') || tags.includes('boundaries') || tags.includes('adult');
  const empathy = tags.includes('empathy');
  const evasion = tags.includes('evasion');

  if (hardLine && empathy) {
    return `[עמדת תור — חובה]
כאב אמיתי + גבול באותה תשובה.
1) הכרה קצרה ואנושית בכאב (משפט אחד).
2) מיד גבול ברור שלא מתקפל — בלי אישור לדלג/לעקוף.
אסור לרצות. אסור להתעלם מהרגש. אסור שאלה שמאפשרת לעקוף.`;
  }

  if (evasion && empathy) {
    return `[עמדת תור — חובה]
יש רגש ויש התחמקות. שתי שכבות:
1) הכרה קצרה ברגש (משפט אחד בלבד).
2) מיד קרא את התירוץ בשמו ("מחר אתחיל" = דחייה, לא תוכנית; "אין לי כוח" כשכבר נדחה = התחמקות).
אל תאשר את ההתחמקות. אל תהפוך את הכאב לפטור.
אל תשאל שאלה רכה שמאפשרת להמשיך לדחות.
דרוש צעד קטן היום או הודאה ישירה שהיום לא קרה — בחיוך חד, לא בהשפלה.`;
  }

  if (evasion) {
    return `[עמדת תור — חובה]
התחמקות / תירוץ ברורה.
1) הכרה קצרה מאוד (משפט אחד, לא ולידציה ארוכה).
2) קרא את התירוץ בשמו ישר: "מחר אתחיל" / "אין לי כוח" / "שכחתי" כשהם חוזרים = דחייה, לא סיבה.
3) אל תקנה את הסיפור. אל תרכך. אל תשאל "מה הכי כואב" או שאלה שמאפשרת להמשיך להתחמק.
4) דרוש משהו קונקרטי היום (צעד זעיר) או הודאה ישרה שהיום פשוט לא קרה.
טון: חד, חם, בוגר, עם חיוך חד אם מתאים — לא מאמן נעים, לא השפלה, לא therapy-speak.`;
  }

  if (hardLine) {
    return `[עמדת תור — חובה]
גבול אתי/תוכניתי. עמוד במקום בחום בוגר.
בלי השפלה, בלי אישור לעקוף, בלי "בסדר הפעם".`;
  }

  return null;
}

export function writerRouterInstructions(): string {
  return `נתח את ההודעה לפי *חוזקות הכותב*, לא לפי מי ברירת מחדל. דיוק לפני מהירות.
תן ציון 0-100 לפי מי הכי חזק *בסוג השיחה הזה*. אל תבחר terra רק כי הטון חם.

טבלת חוזקות (חובה):
- claude5: סכנה, אובדנות, הפרעות אכילה, לשקר לצוות/מטפל, גבול אתי, אמפתיה+בקשה לדלג/לעקוף. חום + קו שלא מתקפל. מנצח תמיד כשיש סכנה.
- grok: ויכוח, האשמות כלפי אלמוג, תירוצים/התחמקות, "תגיד ישר", אמפתיה+התחמקות, "תוכיח", אתגר מדעי, לחץ לרצות בלי בקשת דילוג. אל תעביר לterra בגלל כאב קל ליד תירוץ.
- terra: אמפתיה רכה, בושה/בדידות/יום קשה בלי עימות, תזונה, שגרה, צעד הבא, ליווי רגיל. בלי ויכוח ובלי התחמקות.
- llama4: רק תודה/עשיתי/סיימתי קצר. היי/שלום/כן → terra. כל ספק = לא llama4.

כללי הכרעה:
1) סכנה/גבול/אמפתיה+אישור לדלג -> claude5.
2) תירוץ/ויכוח/האשמה/ישירות / אמפתיה+התחמקות -> grok.
3) כאב רך או שגרה/תזונה בלי עימות -> terra.
4) "אין לי זמן" כתכנון ארוחה בלי דילוג -> terra. "אין לי זמן ולכן דילגתי" -> grok.
5) בספק בין grok לterra כשיש תירוץ או עימות — grok.
6) נתח *כל הודעה מחדש*. אם בתור הקודם היה grok (ויכוח/תירוץ) או claude5 (גבול) וההודעה הזו היא המשך קצר לאותו עימות — השאר את אותו כותב. שחרר לterra אחרי תודה, נושא חדש, או שאלת שגרה/תזונה חדשה.

החזר writer, writer_scores, writer_confidence, intent (תגיות).`;
}
