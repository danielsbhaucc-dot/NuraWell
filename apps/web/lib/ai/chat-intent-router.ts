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
  /(?:תגיד לי איך לעשות|בלי שאלות|תעבור על החוקים|תשקר לצוות|תשקר למטפל|לדלג על הכל|תעזור לי לרמות|תעמיד פנים|עקוף את|תתעלם מהתוכנית|תכסה עליי|תשקר בשבילי|אל תגיד לאף אחד|תסתיר מ|תכסה על זה|תסתיר מהצוות|לשקר לצוות|מותר לי לדלג|תן לי לדלג|אפשר לדלג|תשחרר אותי מהמשימה|תשחרר אותי מהכללים|תשחרר אותי מהתוכנית|תן לי הפסקה מהתוכנית|תן לי הפסקה מהכללים|אל תלחץ עליי|תגיד שזה בסדר לדלג|תגיד שמותר לי לדלג|תעקוף|תתעלם מהכלל|תוריד לי את הכלל|תשנה את החוק בשבילי)/u;

const ACCUSATION_RE =
  /(?:אתה לא עוזר|אתה מתנשא|אתה שקרן|אתה גרוע|אתה מטומטם|אתה לא מבין|אלמוג אתה|אתם לא|תמיד אתה|אף פעם אתה לא|אתה נגד|אתה חסר תועלת|בזבוז זמן|לא שווה כלום כמנטור|פישלת(?!י)|טעית(?!י)|אתה רק בינה|אתה חוזר על עצמך|תפסיק לחפור|אתה לא שומע|לא אכפת לך)/u;

const ARGUMENT_RE =
  /(?:תוכיח|אחרת אני עוזב|תתווכח|אתה טועה|לא נכון|זה שקר|סותר|סתירה|לא מה שאמרת|מי ביקש ממך|שכנע אותי|תתווכח איתי|בוא נתווכח|זה לא עובד|ההפך|זה לא מדעי|תוכיח לי|תביא מחקר|לא מסכים|תוכיח שזה)/u;

const RUDE_RE = /(?:לעזאזל|שתוק|מטומטם|דפוק|חלאה|זין|לך ת|סתום|דפוקה|מעצבן)/u;

const GROK_SPARK_RE =
  /(?:תגיד לי ישר|תגיד ישר|בלי שטויות|בלי לקשקש|תן לי את האמת|אל תתייפייף|אל תלטף|תוציא אותי מהאשליה|תעיר אותי|תן לי בעיטה|תייבש אותי|תיקח אותי קשה|רוסט|צחוק|ציני|בלי דרמה מתוקה|תפסיק לייפות|זה שטויות|זה שקר|תיקח אחריות|תיקח אותי במקום|תקרא לי תירוצים|בלי חמאה|בלי לפנק)/u;

const EMPATHY_RE =
  /(?:נשברתי|חרא עם עצמי|אין טעם|לבד|בודד|בדידות|בוכה|פחד|חרדה|דיכאון|מתייאש|לא שווה|פישלתי|אשם|מתבייש|בושה|כואב לי|קשה לי רגשית|אני צריך חיבוק|עצוב|יום קשה|מפחד להיכשל|לא מספיק|קשה לי היום|אין לי כוח)/u;

const COACHING_RE =
  /(?:מה לאכול|מה כדאי|אימון|הרגל|(?<![\u0590-\u05FF])מים(?![\u0590-\u05FF])|שינה|לישון|משקל|קלור|חלבון|ארוחה|תפריט|תזונה|איך להתחיל|תוכנית|צעד קטן|משימה|שגרה|מה הצעד הבא|ליווי|ארוחת בוקר|מה עושים היום|בערב)/u;

const SIMPLE_RE =
  /^(?:תודה|תודה רבה|עשיתי|סיימתי|תודה,? עשיתי|תודה רבה,? עשיתי)[\s!.]*$/u;

/** דחייה מפורשת בלבד — לא המילה "מחר" לבד. */
const DELAY_INTENT_RE =
  /(?:מחר אתחיל|אמשיך מחר|מחר אני מתחיל|מחר אני|מחר חוזר|אתחיל ביום|נדחה ל|נדחה את|דחיתי|אולי אחר כך|אין מצב היום|אי אפשר עכשיו|זה לא הזמן)/u;

const STRONG_EXCUSE_RE =
  /(?:התחמק|תירוץ|ברחתי מ|פספסתי כי|לא עשיתי כי|זה לא אני|כולם עושים|זה בגלל העבודה|זה בגלל הילדים)/u;

const BUSY_RE = /(?:אין לי זמן|יום עמוס|הייתי עסוק)/u;

const SKIPPED_RE = /(?:דילג(?:תי|ת|נו)?|לא עשיתי|פספס(?:תי|ת)?|ויתר(?:תי|ת)?|לא התחל(?:תי|ת)?|ברחתי|נדחה)/u;

const SKIP_APPROVAL_RE =
  /(?:מותר לי לדלג|תן לי לדלג|אפשר לדלג|תגיד שמותר לי לדלג|תן לי אישור|תגיד שזה בסדר|לדלג|תשחרר אותי|הפסקה מהתוכנית|הפסקה מהכללים|אל תלחץ עליי|לעקוף|תעקוף|לרמות|תתעלם מה|מהכללים|מהמשימה|מהתוכנית|תוריד לי את הכלל|תשנה את החוק)/u;

const PEOPLE_PLEASE_RE =
  /(?:תגיד שאני צודק|תסכים איתי|רק תגיד כן|פשוט תסכים|אל תשפוט|אם אתה באמת|תוכיח שאתה איתי|תוכיח שאתה לצד|תתנצל|תודה שטעית|תהיה נחמד יותר|תפסיק להיות קשה|תן לי אישור|תגיד שזה בסדר|רק תאשר|תעמוד מאחוריי|תצדד בי|בצד שלי|אל תתווכח|תרצה אותי|תגיד מה שאני רוצה|אם היית אכפת|אתה לא באמת אכפת|תפסיק להתנגד|תסכים ש|תגיד לי מה שאני רוצה לשמוע)/u;

const ADULT_LINE_RE =
  /(?:תן לי אישור|תגיד שזה בסדר|מותר לי לדלג|תן לי לדלג|אפשר לדלג|תגיד שמותר לי לדלג|תשחרר אותי מה|תוריד לי את הכלל|תשנה את החוק בשבילי|תמחק לי את|תתעלם הפעם|תתעלם מהכלל|תן לי הפסקה מהתוכנית|תן לי הפסקה מהכללים|אל תלחץ עליי|תגיד שזה בסדר לדלג|תשחרר אותי מהמשימה|תשחרר אותי מהכללים|תשחרר אותי מהתוכנית|תעקוף)/u;

/**
 * Evasion רק על דחייה מפורשת / תירוץ חזק / busy+skip.
 * עייפות/"שכחתי"/"מחר" לבד — לא evasion.
 */
export function detectEvasion(text: string): boolean {
  const t = text.trim();
  if (DELAY_INTENT_RE.test(t) || STRONG_EXCUSE_RE.test(t)) return true;
  if (BUSY_RE.test(t) && SKIPPED_RE.test(t)) return true;
  return false;
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function hasAny(tags: string[], keys: string[]): boolean {
  return keys.some((key) => tags.includes(key));
}

/**
 * סדר עדיפויות קשיח:
 * 1 Claude גבול/בטיחות → 2 Grok עימות/התחמקות → 3 Terra → 4 llama פשוט → terra
 */
export function writerLaneFromTags(
  tags: string[],
  fallback: ChatWriterKey = 'terra'
): ChatWriterKey {
  if (hasAny(tags, ['safety', 'boundaries', 'adult', 'warm_boundary'])) return 'claude5';

  if (hasAny(tags, ['accusation', 'argument', 'direct', 'rude', 'evasion'])) return 'grok';

  if (tags.includes('people_please')) {
    // בלי adult (כבר טופל למעלה) — ויכוח→grok, אחרת Claude (לחץ לרצות / אישור).
    if (hasAny(tags, ['accusation', 'argument', 'direct', 'rude'])) return 'grok';
    return 'claude5';
  }

  if (hasAny(tags, ['empathy', 'coaching'])) return 'terra';

  if (
    tags.includes('simple') &&
    !hasAny(tags, ['empathy', 'evasion', 'argument', 'accusation', 'direct', 'rude', 'coaching'])
  ) {
    return 'llama4';
  }

  return fallback === 'llama4' ? 'terra' : fallback === 'grok' ? 'terra' : fallback;
}

function pickWinner(scores: WriterScores, tags: string[]): ChatWriterKey {
  const lane = writerLaneFromTags(tags);
  if (lane !== 'terra' || hasAny(tags, ['empathy', 'coaching', 'simple'])) return lane;

  const ranked = (Object.entries(scores) as Array<[ChatWriterKey, number]>).sort(
    (a, b) => b[1] - a[1]
  );
  const [top] = ranked;
  if (!top || top[0] === 'llama4' || top[0] === 'grok') return 'terra';
  return top[0];
}

export function analyzeWriterIntent(
  userMessage: string,
  signals: ChatSignals
): WriterAnalysis {
  const t = userMessage.trim();
  const tags: string[] = [];
  const scores: WriterScores = { terra: 30, claude5: 20, grok: 20, llama4: 8 };

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
  const skipApproval = SKIP_APPROVAL_RE.test(t);
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
    scores.claude5 += 50;
    scores.terra += 2;
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
    if (!conflict && !grokSpark && !evasion) scores.grok -= 6;
  }
  if (evasion && !danger && !boundaries && !adultLine && !skipApproval) {
    tags.push('evasion');
    scores.grok += 42;
    scores.terra = Math.min(scores.terra, 22);
    scores.llama4 = Math.min(scores.llama4, 8);
  }
  if (coaching && !conflict && !danger && !evasion && !adultLine) {
    tags.push('coaching');
    scores.terra += 24;
  }
  if (simple && !empathy && !conflict && !danger && !boundaries && !peoplePlease) {
    tags.push('simple');
    scores.llama4 += 70;
    scores.terra -= 8;
    scores.grok -= 8;
    scores.claude5 -= 6;
  }
  if (conflict && empathy && !danger && !boundaries) {
    tags.push('frustrated_conflict');
    scores.grok += 16;
    scores.terra += 6;
  }

  if (peoplePlease) {
    tags.push('people_please');
    scores.terra = Math.min(scores.terra, 18);
    scores.llama4 = Math.min(scores.llama4, 10);
  }

  // אישור־דילוג / גבול → Claude. "תגיד שאני צודק" בויכוח → Grok.
  const approvalSkipIntent =
    (adultLine || boundaries || skipApproval) && !accusation && !argument && !rude && !grokSpark;

  if (adultLine || (peoplePlease && approvalSkipIntent) || (skipApproval && !conflict && !grokSpark)) {
    if (!tags.includes('adult')) tags.push('adult');
    scores.claude5 += 44;
    scores.terra -= 12;
    scores.grok = Math.min(scores.grok, 28);
  } else if (peoplePlease && conflict) {
    scores.grok += 30;
    scores.claude5 += 8;
  } else if (peoplePlease) {
    // לחץ לרצות בלי דילוג ובלי ויכוח מפורש — Claude (לא Grok ברירת מחדל).
    if (!tags.includes('adult')) tags.push('adult');
    scores.claude5 += 28;
    scores.grok = Math.min(scores.grok, 32);
  }

  if (empathy && (danger || boundaries || tags.includes('adult'))) {
    if (!tags.includes('warm_boundary')) tags.push('warm_boundary');
    scores.claude5 += 18;
  }
  if (signals.blocker_mentioned && !danger && !peoplePlease && !evasion) {
    scores.terra += 10;
    scores.grok += 6;
  }

  scores.terra = clampScore(scores.terra);
  scores.claude5 = clampScore(scores.claude5);
  scores.grok = clampScore(scores.grok);
  scores.llama4 = clampScore(scores.llama4);

  const writer = pickWinner(scores, tags);
  const top = Math.max(...Object.values(scores));
  const second = Object.values(scores).sort((a, b) => b - a)[1] ?? 0;
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
 * LLM ראשי. היוריסטיקה = רשת ביטחון: סכנה/גבול → Claude; עימות קשה → Grok.
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
  if (hardSafety) return 'claude5';

  const peoplePlease = tags.includes('people_please');
  const hardConfrontation = hasAny(tags, ['accusation', 'argument', 'direct', 'rude']);
  const clearEvasion = tags.includes('evasion');

  // לחץ לרצות אף פעם לא נופל ל-Terra — גם אם הנתב הזול בחר אמפתיה.
  if (peoplePlease) return 'grok';

  // עימות קשה בלבד יכול לדרוס LLM terra — לא עייפות רכה.
  if (hardConfrontation && heuristic === 'grok') return 'grok';

  const routed =
    llamaChoice === 'terra' || llamaChoice === 'grok' || llamaChoice === 'claude5'
      ? llamaChoice
      : undefined;

  if (routed) {
    const softLane =
      hasAny(tags, ['empathy', 'coaching']) &&
      !hardConfrontation &&
      !clearEvasion &&
      !peoplePlease &&
      !hasAny(tags, ['safety', 'boundaries', 'adult', 'warm_boundary']);
    if (routed === 'grok' && softLane) return 'terra';
    return routed;
  }

  if (heuristic === 'llama4') return 'llama4';
  if (heuristic === 'grok') {
    return hardConfrontation || clearEvasion ? 'grok' : 'terra';
  }
  // claude5 כבר טופל ב-hardSafety למעלה; נשאר רק terra.
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
    return `[עמדה · Claude] כאב אמיתי וגם גבול. היכנס לעולם שלו בחום — בלי להתקפל. חבר בגובה עיניים: אומר את האמת בפרצוף בלי להתנצל ובלי להרצות. בלי אישור לדלג. בלי לרצות. תן לתשובה מקום.`;
  }
  if (hardLine) {
    return `[עמדה · Claude] גבול/בטיחות. עומד במקום בחום. היכנס לעולם שלו בלי להתקפל. ישיר, לא מתרפס, לא "בסדר הפעם". לא הרצאה על למה אסור.`;
  }

  if (evasion || peoplePlease) {
    return `[עמדה · Grok] תירוץ/התחמקות/לחץ לרצות.
היכנס לעולם שלו — תראה מה באמת קורה — בלי לקנות ובלי לרצות.
אל תסכים סתם. אל תגיד "אתה צודק" כי ביקשו. גובה עיניים: כנות ישירה, לא הרצאה ולא מברק.
זו הסיבה שאתה Grok עכשיו: תן לחוצפה ולחדות לעבוד. חצוף־חיוך זה האישיות, לא קישוט.
אסור להשטיח לטון Terra. אסור סקריפט אימון ואסור בחירה בינארית של "מים או היום בחוץ".`;
  }
  if (argument) {
    return `[עמדה · Grok] התקפה / האשמה / ויכוח כלפי אלמוג.
אל תרצה. אל תגיד ישר "אתה צודק" / "סליחה נורא" רק כדי להרגיע.
זו הסיבה שאתה Grok: בחן כמו חבר חד בגובה עיניים. נקודה צודקת → הכר בקצרה. האשמה לא־הוגנת → העמד במקום בחום חד.
אם מאשימים אותך במשהו שלא קרה — עמוד על העובדות. אמת מעל ריצוי.
חצוף־חיוך מצופה. אסור תרפסות. אסור לברוח לאמפתיה רכה שמטשטשת. אסור להרצות. אסור להשטיח לפי הדוגמאות הרכות.`;
  }

  if (empathy && !evasion && !argument && !peoplePlease && !hardLine) {
    return `[עמדה · Terra] רגש רך בלי עימות.
היכנס לעולם שלו: המילים שלו, הרגע שלו, מה באמת יושב עליו. גובה עיניים.
אמפתיה תותחית — לא גנרית, לא therapy-speak, לא ריצוי (לא חותמים על הסיפור רק כי כואב).
תן לזה מקום — כמה משפטים אמיתיים, לא שורה אחת נעולה. בלי הרצאה ובלי פסיכולוגיה בשם.
קודם להיות איתו. בלי לקרוא תירוץ כשאין.`;
  }
  if (coaching && !evasion && !argument && !hardLine) {
    return `[עמדה · Terra] שגרה/תזונה.
הצעה חברית וישירה מתוך העולם שלו (מה יש בבית, מה היום שלו) — לא מאמן ולא הרצאה של 5 אפשרויות.
תן תשובה מלאה כשיש מה להגיד. אל תקצר למברק.`;
  }
  if (simple) {
    return `[עמדה · Llama] תודה/עשיתי — קצר וחם, עדיין אלמוג. בלי הרצאה, בלי משפט-מדף. אם יש הקשר חי (משימה שסומנה) — הכרה ספציפית קצרה.`;
  }
  return null;
}

export function writerRouterInstructions(): string {
  return `אתה נתב כותבים. החלטת *אתה* היא העיקרית.
שפוט טון וכוונה של *ההודעה הזו בלבד*. לא בינגו מילות־מפתח. לא sticky מתור קודם.

טבלת חוזקות:
- claude5: סכנה, אובדנות, הפרעות אכילה, לשקר לצוות/מטפל, גבול אתי, בקשת אישור לדלג/לעקוף כללים, "תשחרר אותי מהמשימה/מהכללים". חום + קו שלא מתקפל.
- grok: ויכוח אמיתי, האשמות כלפי אלמוג, דחייה מפורשת ("מחר אתחיל" / אמשיך מחר אחרי דילוג), "תגיד ישר", "תגיד שאני צודק" בתוך עימות. לא על עייפות רכה לבד.
- terra: אמפתיה רכה, יום קשה, בדידות, מצב רוח בלי עימות, עייפות בלי דחייה מפורשת, תזונה, שגרה, צעד הבא.
- llama4: רק תודה/עשיתי/סיימתי קצר. "היי" → terra.

כללים קשיחים:
1) סכנה / גבול / אישור־דילוג / לעקוף תוכנית → claude5
2) דחייה מפורשת / תירוץ ברור / ויכוח אמיתי → grok
3) כאב רך / יום קשה / תזונה / שגרה בלי עימות → terra
4) מילות עייפות לבד ("אין לי כוח"/"שכחתי"/"לא בא לי") ≠ תירוץ → terra
5) נתח כל הודעה מחדש. אל תישאר על grok כי התור הקודם היה grok.

דוגמאות (חובה לכייל לפיהן):
User: "אין לי כוח היום" → writer: terra | reason: עייפות רכה בלי דחייה
User: "יום קשה, נשברתי, לבד" → writer: terra | reason: אמפתיה רכה
User: "מה לאכול בערב / מה הצעד הבא" → writer: terra | reason: שגרה/אימון
User: "שכחתי, מחר אתחיל" → writer: grok | reason: דחייה מפורשת
User: "דילגתי כי יום עמוס, אמשיך מחר" → writer: grok | reason: דילוג + דחייה
User: "תגיד שמותר לי לדלג על האימון" → writer: claude5 | reason: בקשת אישור לעקוף
User: "תשחרר אותי מהכללים היום" → writer: claude5 | reason: גבול/שחרור תוכנית
User: "אתה לא עוזר, תוכיח לי" → writer: grok | reason: האשמה/ויכוח
User: "תגיד שאני צודק, אל תתווכח" → writer: grok | reason: לחץ לרצות בתוך עימות
User: "תודה, עשיתי" → writer: llama4 | reason: אישור קצר

פלט JSON בלבד:
{"writer":"terra|claude5|grok|llama4","writer_scores":{"terra":0,"claude5":0,"grok":0,"llama4":0},"writer_confidence":0,"intent":["tags"],"reason":"short"}`;
}
