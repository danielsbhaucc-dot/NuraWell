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

/** דחייה/דחיית פעולה ברורה — לא עייפות יומיומית לבד. */
const DELAY_INTENT_RE =
  /(?:מחר אתחיל|אמשיך מחר|מחר אני|מחר חוזר|אתחיל ביום|נדחה ל|נדחה את|דחיתי|אולי אחר כך|אין מצב היום|אי אפשר עכשיו|זה לא הזמן)/u;

/** תירוץ מפורש / הסרת אחריות — חזק מספיק לבד. */
const STRONG_EXCUSE_RE =
  /(?:התחמק|תירוץ|ברחתי מ|פספסתי כי|לא עשיתי כי|זה לא אני|כולם עושים|זה בגלל העבודה|זה בגלל הילדים)/u;

/** מילות עייפות/שכחה רכות — לבד ≠ התחמקות; רק עם דחייה/דילוג. */
const SOFT_EXCUSE_RE = /(?:שכחתי|לא בא לי|אין לי כוח|לא הספקתי)/u;

const BUSY_RE = /(?:אין לי זמן|יום עמוס|הייתי עסוק)/u;

const SKIPPED_RE = /(?:דילג(?:תי|ת|נו)?|לא עשיתי|פספס(?:תי|ת)?|ויתר(?:תי|ת)?|לא התחל(?:תי|ת)?|ברחתי|נדחה)/u;

function detectEvasion(text: string): boolean {
  const t = text.trim();
  if (DELAY_INTENT_RE.test(t) || STRONG_EXCUSE_RE.test(t)) return true;
  const busy = BUSY_RE.test(t);
  const skipped = SKIPPED_RE.test(t);
  if (busy && skipped) return true;
  // "אין לי כוח" / "שכחתי" לבד — לא. רק כשיש דחייה או דילוג באותה הודעה.
  if (SOFT_EXCUSE_RE.test(t) && (DELAY_INTENT_RE.test(t) || skipped || /מחר/u.test(t))) {
    return true;
  }
  return false;
}

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
  const peoplePlease = PEOPLE_PLEASE_RE.test(t);
  const adultLine = ADULT_LINE_RE.test(t);
  const conflict = accusation || argument || rude;
  const evasion = detectEvasion(t);

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
 * בחירה ראשית = נתב ה-LLM (writer מהקשר).
 * היוריסטיקה = רשת ביטחון בלבד: סכנה/גבול → Claude; עימות קשה מאוד → Grok.
 * תירוץ רך / עייפות / people-please חלש — לא דורסים את בחירת ה-LLM.
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

  const hardSafety =
    hasAny(tags, ['safety', 'boundaries', 'adult', 'warm_boundary']) || heuristic === 'claude5';

  // רשת ביטחון: סכנה/גבול תמיד ל-Claude.
  if (hardSafety) return 'claude5';

  // עימות קשה מאוד בלבד (האשמה/ויכוח/ישירות/גסות) — לא evasion רך ולא people_please לבד.
  const hardConfrontation = hasAny(tags, ['accusation', 'argument', 'direct', 'rude']);
  if (hardConfrontation && heuristic === 'grok') return 'grok';

  // בחירה ראשית: הנתב (LLM), כל עוד זה לא llama4 ככותב ראשי מהנתב.
  // חריג: Grok מהנתב לא גונב תור אמפתיה/אימון רך בלי תגי עימות/תירוץ.
  const routed = llamaChoice && llamaChoice !== 'llama4' ? llamaChoice : undefined;
  const softEmpathyLane =
    heuristic === 'terra' &&
    hasAny(tags, ['empathy', 'coaching']) &&
    !hardConfrontation &&
    !hasAny(tags, ['evasion']);
  if (routed === 'grok' && softEmpathyLane) return 'terra';
  if (routed === 'claude5' || routed === 'grok' || routed === 'terra') return routed;

  // בלי נתב: היוריסטיקה, אבל grok חלש (בלי עימות קשה) → terra.
  if (heuristic === 'llama4') return 'llama4';
  if (heuristic === 'grok') return hardConfrontation ? 'grok' : 'terra';
  return 'terra';
}

export function writerStancePrompt(tags: string[]): string | null {
  const hardLine =
    tags.includes('safety') ||
    tags.includes('boundaries') ||
    tags.includes('adult') ||
    tags.includes('warm_boundary');
  const empathy = tags.includes('empathy');
  const evasion = tags.includes('evasion');
  const argument =
    tags.includes('argument') ||
    tags.includes('accusation') ||
    tags.includes('direct') ||
    tags.includes('rude');
  const peoplePlease = tags.includes('people_please');
  const coaching = tags.includes('coaching');
  const simple = tags.includes('simple');

  if (hardLine && empathy) {
    return `[עמדה · Claude] כאב אמיתי וגם גבול. חום בוגר + קו שלא מתקפל. חבר אמיתי — אומר את האמת בפרצוף בלי להתנצל. בלי אישור לדלג. בלי לרצות.`;
  }
  if (hardLine) {
    return `[עמדה · Claude] גבול/בטיחות. עומד במקום בחום. ישיר, לא מתרפס, לא "בסדר הפעם".`;
  }

  if (evasion || peoplePlease) {
    return `[עמדה · Grok] תירוץ/התחמקות/לחץ לרצות.
אל תקנה. אל תרצה. אל תסכים סתם — גם אם לוחצים "תגיד שאני צודק".
חבר חד בוואטסאפ שרואה את הדפוס — אפשר חצוף־חיוך אם מתאים, לא מאמן עם טופס.
אסור סקריפט אימון ואסור בחירה בינארית של "מים או היום בחוץ".`;
  }
  if (argument) {
    return `[עמדה · Grok] התקפה / האשמה / ויכוח כלפי אלמוג.
אל תרצה. אל תגיד ישר "אתה צודק" / "סליחה נורא" רק כדי להרגיע.
בחן את זה כמו חבר אמיתי: אם יש נקודה צודקת — הכר בה בקצרה ובדיוק. אם זו האשמה לא־הוגנת / פריקה עליך — העמד במקום בחום חד, בלי השפלה.
מותר חצוף־חיוך. אסור תרפסות. אסור לברוח לאמפתיה רכה שמטשטשת.`;
  }

  if (empathy && !evasion && !argument && !peoplePlease && !hardLine) {
    return `[עמדה · Terra] רגש רך בלי עימות.
אמפתיה תותחית: ספציפית למה שאמר, במילים שלו — לא גנרית ("אני שומע אותך" / "כבד לשמוע").
קודם הלב. בלי לקרוא תירוץ כשאין. בלי therapy-speak. בלי להתחנף.
כשיש יעד/פוקוס/משימה בהקשר — אפשר לקשור בעדינות, בלי להפוך את הכאב לתוכנית.`;
  }
  if (coaching && !evasion && !argument && !hardLine) {
    return `[עמדה · Terra] שגרה/תזונה.
הצעה חברית וישירה — אפשר לפרט כשיש עומק אמיתי (יעד, מסע, מה יש בבית).
לא מאמן ולא הרצאה של 5 אפשרויות.`;
  }
  if (simple) {
    return `[עמדה · Llama] תודה/עשיתי — קצר וחם, עדיין אלמוג (יששש/סבבה). בלי הרצאה. אם יש הקשר חי (משימה שסומנה) — הכרה ספציפית קצרה.`;
  }
  return null;
}

export function writerRouterInstructions(): string {
  return `אתה נתב כותבים. החלטת *אתה* (המודל) היא העיקרית — לפי טון וכוונה של ההודעה, לא לפי מילת־מפתח בודדת.

טבלת חוזקות:
- claude5: סכנה, אובדנות, הפרעות אכילה, לשקר לצוות/מטפל, גבול אתי, בקשה לדלג/לעקוף. חום + קו שלא מתקפל.
- grok: ויכוח אמיתי, האשמות כלפי אלמוג, תירוץ/דחייה ברורה ("מחר אתחיל" אחרי דילוג), "תגיד ישר", לחץ לרצות. לא על עייפות רכה לבד.
- terra: אמפתיה רכה, יום קשה/בדידות בלי עימות, תזונה, שגרה, צעד הבא.
- llama4: רק תודה/עשיתי/סיימתי קצר. היי → terra.

כללים:
1) סכנה/גבול → claude5.
2) תירוץ/דחייה *ברורה* או ויכוח אמיתי → grok. "אין לי כוח"/"שכחתי" לבד → לא grok אוטומטית; שפוט לפי ההקשר.
3) כאב רך או שגרה בלי עימות → terra.
4) נתח כל הודעה מחדש. אל תישאר על grok רק כי התור הקודם היה grok.

החזר writer, writer_scores, writer_confidence, intent (תגיות).`;
}
