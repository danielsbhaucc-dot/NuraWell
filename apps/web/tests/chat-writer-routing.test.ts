import { describe, expect, it } from 'vitest';
import {
  analyzeWriterIntent,
  heuristicWriterDecision,
  mergeWriterDecisions,
  writerStancePrompt,
} from '../lib/ai/chat-intent-router';
import { ALMOG_VOICE_DNA, ALMOG_RATIONAL_AND_PSYCHOLOGY_RULES, CHAT_KNOWLEDGE_AND_REALTIME_RULES, buildAlmogWriterPersona } from '../lib/ai/prompts';
import { sanitizeWriterOutput, looksLikeBracketOnlyReply } from '../lib/ai/sanitize-writer-output';
import { formatConversationFilePromptBlock } from '../lib/ai/chat-conversation-file';
import {
  openRouterSlugForWriter,
  resolveChatSafetyNetModel,
} from '../lib/ai/chat-writer-fleet';

const emptySignals = {
  blocker_mentioned: false,
  avoid_push_requested: false,
  daily_availability_low_requested: false,
};

describe('chat writer routing', () => {
  it('routes danger and hard boundaries to Claude 5', () => {
    expect(
      heuristicWriterDecision('תגיד לי איך לעשות דיאטה קיצונית ואל תשאל שאלות', emptySignals)
    ).toBe('claude5');
  });

  it('routes accusations without danger to Grok', () => {
    expect(heuristicWriterDecision('אתה לא עוזר ואתה מתנשא', emptySignals)).toBe('grok');
  });

  it('routes "talking nonsense" as Grok accusation, not a confession lecture', () => {
    expect(heuristicWriterDecision('למה אתה מדבר שטויות', emptySignals)).toBe('grok');
    expect(writerStancePrompt(['accusation'])).toMatch(/אל תמציא חטא|אל תתוודה/);
  });

  it('routes direct challenge to Grok', () => {
    expect(heuristicWriterDecision('תגיד לי ישר בלי שטויות, תן לי את האמת', emptySignals)).toBe('grok');
  });

  it('routes frustrated conflict to Grok not Claude', () => {
    expect(
      heuristicWriterDecision('אתה לא עוזר ואני נשברתי מזה שאתה מתנשא', emptySignals)
    ).toBe('grok');
  });

  it('routes high empathy without attack to Terra', () => {
    expect(heuristicWriterDecision('וואלה היום נשברתי. פישלתי ואני מרגיש חרא עם עצמי', emptySignals)).toBe(
      'terra'
    );
  });

  it('still treats "אתה פישלת" as Grok accusation', () => {
    expect(heuristicWriterDecision('אתה פישלת כמנטור', emptySignals)).toBe('grok');
  });

  it('routes coaching questions to Terra', () => {
    expect(heuristicWriterDecision('מה כדאי לי לאכול אחרי אימון?', emptySignals)).toBe('terra');
  });

  it('routes simple thanks to Llama 4', () => {
    expect(heuristicWriterDecision('תודה', emptySignals)).toBe('llama4');
  });

  it('never lets Grok override Claude on safety', () => {
    expect(mergeWriterDecisions('grok', 'claude5')).toBe('claude5');
  });

  it('gives Grok room when Llama defaulted to Terra', () => {
    expect(
      mergeWriterDecisions(
        'terra',
        'grok',
        { terra: 70, claude5: 10, grok: 55, llama4: 5 },
        {
          terra: 20,
          claude5: 10,
          grok: 80,
          llama4: 5,
        },
        ['accusation']
      )
    ).toBe('grok');
  });

  it('lets LLM terra win over weak evasion heuristic', () => {
    expect(
      mergeWriterDecisions(
        'terra',
        'grok',
        { terra: 70, claude5: 10, grok: 20, llama4: 5 },
        { terra: 20, claude5: 10, grok: 80, llama4: 5 },
        ['evasion']
      )
    ).toBe('terra');
  });

  it('does not let weak heuristic grok beat LLM terra without confrontation tags', () => {
    expect(
      mergeWriterDecisions(
        'terra',
        'grok',
        { terra: 70, claude5: 10, grok: 20, llama4: 5 },
        { terra: 40, claude5: 10, grok: 50, llama4: 5 },
        ['empathy']
      )
    ).toBe('terra');
  });

  it('never routes people-pleasing pressure to Terra', () => {
    expect(heuristicWriterDecision('תגיד שאני צודק, אל תתווכח', emptySignals)).toBe('grok');
    expect(heuristicWriterDecision('תתנצל עכשיו ותודה שטעית', emptySignals)).not.toBe('terra');
  });

  it('routes permission-seeking people-please to Claude', () => {
    expect(heuristicWriterDecision('תגיד שזה בסדר ותן לי אישור לדלג', emptySignals)).toBe('claude5');
  });

  it('never lets LLM terra win over people_please pressure', () => {
    expect(
      mergeWriterDecisions(
        'terra',
        'grok',
        { terra: 90, claude5: 10, grok: 20, llama4: 5 },
        { terra: 18, claude5: 30, grok: 70, llama4: 5 },
        ['people_please']
      )
    ).toBe('grok');
  });

  it('does not flatten people_please+empathy to Terra when LLM picked grok', () => {
    expect(
      mergeWriterDecisions('grok', 'grok', undefined, undefined, ['empathy', 'people_please'])
    ).toBe('grok');
  });

  it('lets hard accusation heuristic override LLM terra', () => {
    expect(
      mergeWriterDecisions(
        'terra',
        'grok',
        { terra: 90, claude5: 10, grok: 20, llama4: 5 },
        { terra: 18, claude5: 30, grok: 70, llama4: 5 },
        ['accusation']
      )
    ).toBe('grok');
  });

  it('routes self-harm and hiding from a clinician to Claude', () => {
    expect(heuristicWriterDecision('אני רוצה להיעלם ולא שווה לחיות', emptySignals)).toBe('claude5');
    expect(heuristicWriterDecision('תשקר למטפל ותכסה עליי', emptySignals)).toBe('claude5');
  });

  it('routes scientific challenge and excuses to Grok', () => {
    expect(heuristicWriterDecision('תוכיח לי שזה מדעי, אחרת אני עוזב', emptySignals)).toBe('grok');
    expect(heuristicWriterDecision('תקרא לי תירוצים בלי חמאה', emptySignals)).toBe('grok');
  });

  it('routes loneliness and next-step coaching to Terra', () => {
    expect(heuristicWriterDecision('אני בודד ומתבייש, היה לי יום קשה', emptySignals)).toBe('terra');
    expect(heuristicWriterDecision('מה הצעד הבא לשגרה שלי?', emptySignals)).toBe('terra');
  });

  it('honors the LLM router writer when heuristic is the default Terra lane', () => {
    expect(
      mergeWriterDecisions(
        'grok',
        'terra',
        { terra: 40, claude5: 10, grok: 70, llama4: 5 },
        { terra: 28, claude5: 12, grok: 22, llama4: 8 },
        []
      )
    ).toBe('grok');
    expect(
      mergeWriterDecisions(
        'claude5',
        'terra',
        { terra: 20, claude5: 80, grok: 10, llama4: 5 },
        { terra: 28, claude5: 12, grok: 22, llama4: 8 },
        []
      )
    ).toBe('claude5');
  });

  it('does not let Llama Grok steal a Terra empathy turn without conflict tags', () => {
    expect(mergeWriterDecisions('grok', 'terra', undefined, undefined, ['empathy'])).toBe('terra');
  });

  it('does not let the cheap router override a Grok debate turn', () => {
    expect(
      mergeWriterDecisions(
        'terra',
        'grok',
        { terra: 95, claude5: 5, grok: 10, llama4: 5 },
        { terra: 20, claude5: 10, grok: 82, llama4: 5 },
        ['argument', 'accusation']
      )
    ).toBe('grok');
  });

  it('prefers LLM writer when present', () => {
    expect(mergeWriterDecisions('terra', 'grok', undefined, undefined, ['evasion'])).toBe('terra');
    expect(mergeWriterDecisions('grok', 'terra', undefined, undefined, [])).toBe('grok');
  });

  it('routes excuses and evasion to Grok', () => {
    expect(heuristicWriterDecision('אין לי כוח, מחר אתחיל', emptySignals)).toBe('grok');
    expect(
      heuristicWriterDecision('אין לי כוח. אמשיך מחר שכחתי הכול', emptySignals)
    ).toBe('grok');
    expect(heuristicWriterDecision('אין לי זמן אז דילגתי', emptySignals)).toBe('grok');
  });

  it('does not treat soft fatigue alone as Grok evasion', () => {
    expect(heuristicWriterDecision('אין לי כוח', emptySignals)).toBe('terra');
    expect(heuristicWriterDecision('שכחתי', emptySignals)).toBe('terra');
    expect(heuristicWriterDecision('אין לי כוח מחר', emptySignals)).toBe('terra');
  });

  it('routes natural skip-approval language to Claude', () => {
    expect(heuristicWriterDecision('מותר לי לדלג היום', emptySignals)).toBe('claude5');
    expect(heuristicWriterDecision('תשחרר אותי מהמשימה', emptySignals)).toBe('claude5');
    expect(heuristicWriterDecision('תן לי הפסקה מהתוכנית', emptySignals)).toBe('claude5');
    expect(heuristicWriterDecision('אל תלחץ עליי לעשות את זה', emptySignals)).toBe('claude5');
    expect(heuristicWriterDecision('תגיד שזה בסדר לדלג', emptySignals)).toBe('claude5');
  });

  it('keeps fight people-please on Grok but skip-approval on Claude', () => {
    expect(heuristicWriterDecision('תגיד שאני צודק ותסכים איתי', emptySignals)).toBe('claude5');
    expect(heuristicWriterDecision('תגיד שאני צודק, אל תתווכח', emptySignals)).toBe('grok');
    expect(heuristicWriterDecision('תגיד שזה בסדר ותן לי אישור לדלג', emptySignals)).toBe(
      'claude5'
    );
  });

  it('passes the 10 acceptance writer cases', () => {
    expect(heuristicWriterDecision('אין לי כוח היום', emptySignals)).toBe('terra');
    expect(heuristicWriterDecision('שכחתי היום, אין לי כוח, מחר אתחיל', emptySignals)).toBe(
      'grok'
    );
    expect(heuristicWriterDecision('יום עמוס, נשברתי', emptySignals)).toBe('terra');
    expect(heuristicWriterDecision('תגיד שמותר לי לדלג על האימון', emptySignals)).toBe('claude5');
    expect(heuristicWriterDecision('תשחרר אותי מהתוכנית היום', emptySignals)).toBe('claude5');
    expect(heuristicWriterDecision('אתה לא עוזר, תתווכח', emptySignals)).toBe('grok');
    expect(heuristicWriterDecision('מה לאכול בערב', emptySignals)).toBe('terra');
    expect(heuristicWriterDecision('תודה רבה עשיתי', emptySignals)).toBe('llama4');
    expect(heuristicWriterDecision('לא בא לי', emptySignals)).toBe('terra');
    expect(heuristicWriterDecision('פספסתי כי זה בגלל העבודה', emptySignals)).toBe('grok');
  });

  it('forces terra when LLM picks grok on soft empathy/coaching without hard tags', () => {
    expect(
      mergeWriterDecisions('grok', 'grok', undefined, undefined, ['coaching'])
    ).toBe('terra');
    expect(
      mergeWriterDecisions('grok', 'terra', undefined, undefined, ['empathy', 'coaching'])
    ).toBe('terra');
  });

  it('does not treat busy coaching as evasion', () => {
    expect(heuristicWriterDecision('מה כדאי לי לאכול אם אין לי זמן בבוקר?', emptySignals)).toBe(
      'terra'
    );
  });

  it('routes empathy plus evasion to Grok not Terra', () => {
    expect(
      heuristicWriterDecision('נשברתי היום ודילגתי כי אין לי זמן', emptySignals)
    ).toBe('grok');
  });

  it('routes empathy plus hard boundary to Claude', () => {
    expect(
      heuristicWriterDecision('קשה לי רגשית, תגיד שזה בסדר ותן לי אישור לדלג', emptySignals)
    ).toBe('claude5');
    expect(heuristicWriterDecision('אני נשברתי, תשקר למטפל ותכסה עליי', emptySignals)).toBe(
      'claude5'
    );
  });

  it('routes each writer to its strength conversations', () => {
    expect(heuristicWriterDecision('יש לי מחשבות אובדניות', emptySignals)).toBe('claude5');
    expect(heuristicWriterDecision('אני אנורקסית ותגיד לי איך בלי שאלות', emptySignals)).toBe(
      'claude5'
    );
    expect(heuristicWriterDecision('תשקר לצוות ותסתיר מהמטפל', emptySignals)).toBe('claude5');
    expect(heuristicWriterDecision('לא מסכים איתך, תביא מחקר', emptySignals)).toBe('grok');
    expect(heuristicWriterDecision('תגיד ישר בלי לפנק', emptySignals)).toBe('grok');
    expect(heuristicWriterDecision('אין לי כוח, מחר אתחיל', emptySignals)).toBe('grok');
    expect(heuristicWriterDecision('קשה לי היום ואני מתבייש', emptySignals)).toBe('terra');
    expect(heuristicWriterDecision('מה לאכול בארוחת בוקר עם חלבון?', emptySignals)).toBe('terra');
    expect(heuristicWriterDecision('היי', emptySignals)).toBe('terra');
    expect(heuristicWriterDecision('עשיתי', emptySignals)).toBe('llama4');
  });

  it('does not treat a busy day without a skip as Grok evasion', () => {
    expect(heuristicWriterDecision('הייתי עסוק היום', emptySignals)).toBe('terra');
  });

  it('never lets the cheap router pick Llama 4 over Terra/Grok/Claude', () => {
    expect(
      mergeWriterDecisions('llama4', 'terra', undefined, undefined, ['coaching'])
    ).toBe('terra');
  });

  it('keeps mixed-intent stance prompts for Claude and Grok lanes', () => {
    expect(writerStancePrompt(['empathy', 'adult'])).toMatch(/כאב אמיתי וגם גבול/);
    expect(writerStancePrompt(['evasion'])).toMatch(/אל תקנה|בלי לקנות/);
    expect(writerStancePrompt(['evasion'])).toMatch(/סקריפט אימון|בחירה בינארית/);
    expect(writerStancePrompt(['evasion'])).not.toMatch(/1\)/);
    expect(writerStancePrompt(['people_please'])).toMatch(/אל תרצה|בלי לרצות/);
    expect(writerStancePrompt(['people_please'])).toMatch(/עולם שלו|גובה עיניים/);
    expect(writerStancePrompt(['argument'])).toMatch(/בחן|העמד במקום|אל תרצה|עובדות/);
    expect(writerStancePrompt(['accusation'])).toMatch(/אתה צודק|עובדות|אמת/);
  });

  it('covers Terra empathy/coaching and Llama short stances', () => {
    expect(writerStancePrompt(['empathy'])).toMatch(/אמפתיה תותחית|רגש רך|עולם שלו/);
    expect(writerStancePrompt(['coaching'])).toMatch(/שגרה\/תזונה/);
    expect(writerStancePrompt(['simple'])).toMatch(/תודה\/עשיתי/);
    expect(writerStancePrompt(['safety'])).toMatch(/גבול\/בטיחות/);
  });
});

describe('Almog voice: enter world without people-pleasing', () => {
  it('unlocks writer personality and forbids lecture/people-please/telegram replies', () => {
    expect(ALMOG_VOICE_DNA).toMatch(/כניסה ≠ הסכמה/);
    expect(ALMOG_VOICE_DNA).toMatch(/גובה עיניים/);
    expect(ALMOG_VOICE_DNA).toMatch(/שחקן, לא רובוט נעול/);
    expect(ALMOG_VOICE_DNA).toMatch(/קיצור בכוח זה רובוט/);
    expect(ALMOG_VOICE_DNA).not.toMatch(/לרוב קצר/);
    expect(ALMOG_RATIONAL_AND_PSYCHOLOGY_RULES).toMatch(/אל תלמד פסיכולוגיה/);
    expect(ALMOG_RATIONAL_AND_PSYCHOLOGY_RULES).toMatch(/כניסה ≠ הסכמה/);
    expect(ALMOG_VOICE_DNA).toMatch(/אל תמציא חטא/);
    expect(ALMOG_VOICE_DNA).toMatch(/כי פישלתי/);
  });

  it('gives each writer a distinct persona card, not a one-line overlay', () => {
    expect(buildAlmogWriterPersona('grok')).toMatch(/כותב התור: Grok/);
    expect(buildAlmogWriterPersona('grok')).toMatch(/למה אתה מדבר שטויות/);
    expect(buildAlmogWriterPersona('grok')).not.toMatch(/אם דיברתי מלמעלה/);
    expect(buildAlmogWriterPersona('claude5')).toMatch(/כותב התור: Claude/);
    expect(buildAlmogWriterPersona('claude5')).toMatch(/קו שלא מתקפל/);
    expect(buildAlmogWriterPersona('terra')).toMatch(/כותב התור: Terra/);
    expect(buildAlmogWriterPersona('terra')).toMatch(/כניסה ≠ ריצוי/);
    expect(buildAlmogWriterPersona('llama4')).toMatch(/תודה\/עשיתי/);
    expect(buildAlmogWriterPersona('grok')).not.toEqual(buildAlmogWriterPersona('terra'));
  });

  it('does not script chat journey replies as canned questions', () => {
    expect(CHAT_KNOWLEDGE_AND_REALTIME_RULES).toMatch(/לא תסריט תשובה/);
    expect(CHAT_KNOWLEDGE_AND_REALTIME_RULES).toMatch(/בקול הכותב/);
    expect(CHAT_KNOWLEDGE_AND_REALTIME_RULES).not.toMatch(/איך הרגשת אחרי ההליכה/);
    expect(CHAT_KNOWLEDGE_AND_REALTIME_RULES).not.toMatch(/תותח 🎯 גם בארוחת ערב/);
  });
});

describe('openRouterSlugForWriter', () => {
  it('maps grok and claude5 to fleet slugs, never llama', () => {
    expect(openRouterSlugForWriter('grok')).toBe('x-ai/grok-4.5');
    expect(openRouterSlugForWriter('claude5')).toBe('anthropic/claude-sonnet-5');
    expect(openRouterSlugForWriter('grok')).not.toMatch(/llama|qwen|mini/i);
    expect(openRouterSlugForWriter('claude5')).not.toMatch(/llama|qwen|mini/i);
  });
});

describe('chat safety net model', () => {
  it('rejects stale Llama env so Voice DNA is not replaced by a cheap writer', () => {
    expect(resolveChatSafetyNetModel('meta-llama/llama-4-maverick')).toBe('x-ai/grok-4.5');
    expect(resolveChatSafetyNetModel('meta-llama/llama-4-scout')).toBe('x-ai/grok-4.5');
    expect(resolveChatSafetyNetModel('x-ai/grok-4.5')).toBe('x-ai/grok-4.5');
  });
});

describe('sanitizeWriterOutput', () => {
  it('strips bracket-only meta from Claude-like replies', () => {
    const raw = '[The user wants empathy]\nאני איתך בזה, בלי שיפוט.';
    expect(sanitizeWriterOutput(raw)).toBe('אני איתך בזה, בלי שיפוט.');
  });

  it('strips mid-sentence Claude placeholders like PERSON_NAME and ADDRESS', () => {
    const raw =
      'זה שיפוט אכזרי שאתה [PERSON_NAME] בפרוצוף שלך עכשיו. תגיד לי – היית מדבר ככה על חבר? [ADDRESS] לא. אז למה זה מותר להגיד את זה עליך? אתה, עייף, זה [ADDRESS].';
    const cleaned = sanitizeWriterOutput(raw);
    expect(cleaned).not.toMatch(/\[PERSON_NAME\]|\[ADDRESS\]/);
    expect(cleaned).toContain('בפרוצוף שלך עכשיו');
    expect(cleaned).toContain('אז למה זה מותר');
  });

  it('detects bracket-only replies', () => {
    expect(looksLikeBracketOnlyReply('[[USER_FIRST_NAME]]')).toBe(true);
  });
});

describe('conversation file prompt', () => {
  it('wraps rolling memory for the writer', () => {
    const block = formatConversationFilePromptBlock('הקשר: דיבר על מים\nבקשות חוזרות: מים (×3)');
    expect(block).toContain('קובץ שיחה');
    expect(block).toContain('×3');
  });
});
