import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lintAlmogText, almogVoiceRule, ALMOG_VOICE_RULE, deriveAlmogRegister, seriesRegisterConsistent } from '../lib/ai/almog-voice';
import { hebrewAddressingRule } from '../lib/ai/hebrew-output-rules';
import { lessonGenderCopy } from '../lib/journey/lesson-gender-copy';
import * as pc from '../lib/profile/personalized-copy';
import { addressUser, excitedAlmogLine } from '../lib/challenge/gender-copy';
import { NURAWELL_CHAT_SYSTEM_PROMPT_V2 } from '../lib/ai/prompts-v2';

const root = join(__dirname, '..');
/** Prompt/template sources Almog speaks from. ✓-examples must follow ALMOG_VOICE. */
const SOURCES = [
  'lib/ai/habit-checkpoint-llm.ts',
  'lib/ai/prompts.ts',
  'lib/ai/prompts-v2.ts',
  'lib/churn/reengagement-prompt-blocks.ts',
  'lib/churn/passive-presence-batch.ts',
  'lib/workflows/send-almog-task-followup.ts',
  'lib/ai/send-task-completion-celebration.ts',
  'lib/challenge/content.ts',
  'lib/challenge/insights.ts',
  'lib/challenge/success-detectors.ts',
];

function exampleLines(file: string): string[] {
  return readFileSync(join(root, file), 'utf8')
    .split('\n')
    .filter((l) => !/✗|פסול/.test(l))
    .filter((l) => /✓|דוגמת (טון|רוח)|^\s*'[^']*[א-ת][^']*',?\s*$/.test(l));
}

describe('ALMOG_VOICE — templates & prompt examples', () => {
  for (const file of SOURCES) {
    it(`${file}: no slang, elongation, unnatural phrasing in examples/templates`, () => {
      const bad = exampleLines(file)
        .map((l) => ({ l: l.trim(), issues: lintAlmogText(l.replace(/\((?:זכר|לגבר|לאישה)[^)]*\)/gu, ''), { gender: 'male' }).filter((i) => i.kind !== 'gender') }))
        .filter((x) => x.issues.length);
      expect(bad).toEqual([]);
    });
  }

  it('voice rule is injected into every shared prompt path', () => {
    for (const g of ['male', 'female', null] as const) expect(hebrewAddressingRule(g)).toContain('ALMOG_VOICE');
    expect(NURAWELL_CHAT_SYSTEM_PROMPT_V2).toContain(ALMOG_VOICE_RULE);
    expect(readFileSync(join(root, 'lib/ai/habit-checkpoint-llm.ts'), 'utf8')).toContain('almogVoiceRule(');
    expect(almogVoiceRule('female')).toContain('לשון נקבה');
  });

  it('lint catches the phrasing Gideon flagged', () => {
    expect(lintAlmogText('שתית את השתיים של המים').map((i) => i.kind)).toContain('unnatural');
    expect(lintAlmogText('חברותא, יאללה', { gender: 'male' }).map((i) => i.kind)).toContain('slang');
    expect(lintAlmogText('הנך מוזמן יקירי, וואלה', { gender: 'male' }).map((i) => i.kind)).toContain('register');
    expect(lintAlmogText('בוקררר!!', { gender: 'male' }).map((i) => i.kind)).toContain('elongation');
  });

  it('slang is gender-matched: אחי only for men', () => {
    expect(lintAlmogText('וואלה אחי, כל הכבוד', { gender: 'male' })).toEqual([]);
    expect(lintAlmogText('וואלה אחי, כל הכבוד', { gender: 'female' }).map((i) => i.detail)).toContain('אחי');
    expect(lintAlmogText('מה קורה אחי?').map((i) => i.detail)).toContain('אחי');
    expect(lintAlmogText('וואלה, את אלופה', { gender: 'female' })).toEqual([]);
    expect(lintAlmogText('וואלה, את אלופה', { gender: 'male' }).map((i) => i.detail)).toContain('אלופה');
    expect(lintAlmogText('וואלה, איזה יום')).toEqual([]);
    // formal register: no slang
    expect(lintAlmogText('וואלה, איזה יום', { register: 'formal' }).map((i) => i.kind)).toContain('slang');
  });

  it('register: derived from the user, sticky, consistent across a series', () => {
    expect(deriveAlmogRegister('שלום רב, אשמח אם תוכל לעזור לי עם התוכנית', null)).toBe('formal');
    expect(deriveAlmogRegister('כן', 'formal')).toBe('formal');
    expect(deriveAlmogRegister('וואלה אחי עשיתי', 'formal')).toBe('casual');
    expect(deriveAlmogRegister('', null)).toBe('casual');
    expect(seriesRegisterConsistent(['וואלה, איך הולך?', 'סבבה, מחר ממשיכים'])).toBe(true);
    expect(seriesRegisterConsistent(['וואלה, איך הולך?', 'הנך מוזמן להמשיך'])).toBe(false);
    for (const g of ['male', 'female', null] as const) expect(almogVoiceRule(g, 'formal')).toContain('בלי סלנג');
    expect(almogVoiceRule('female')).toContain('לעולם לא "אחי"');
  });
});

describe('ALMOG_VOICE — gendered variants', () => {
  const GENDERS = ['male', 'female', null] as const;
  const toText = (v: unknown): string[] =>
    typeof v === 'string' ? [v] : typeof v === 'function' ? [String((v as (a: number, b: number) => string)(2, 3))] : [];

  it('lesson copy: correct per-gender, neutral has no slash forms, one register', () => {
    for (const g of GENDERS) {
      const copy = lessonGenderCopy((g ?? '') as never);
      for (const s of Object.values(copy).flatMap(toText)) {
        expect(lintAlmogText(s, { gender: g ?? undefined }), `${g}: ${s}`).toEqual([]);
      }
    }
  });

  it('personalized copy: correct per-gender, neutral has no slash forms', () => {
    for (const g of GENDERS) {
      for (const [name, fn] of Object.entries(pc)) {
        if (typeof fn !== 'function' || name === 'firstNameFrom') continue;
        let out: unknown;
        try {
          out = (fn as (...a: unknown[]) => unknown)(g, 'דנה', 'x', 'y');
        } catch {
          continue;
        }
        const texts = typeof out === 'string' ? [out] : out && typeof out === 'object' ? Object.values(out).filter((v) => typeof v === 'string') : [];
        for (const s of texts as string[]) expect(lintAlmogText(s, { gender: g ?? undefined }), `${name}/${g}: ${s}`).toEqual([]);
      }
    }
  });

  it('challenge copy: no pet names, Almog always speaks masculine about himself', () => {
    expect(addressUser('דנה', 'female')).toBe('דנה');
    expect(addressUser('דני', 'male')).toBe('דני');
    for (const g of ['male', 'female', 'neutral'] as const) {
      const line = excitedAlmogLine('נועה', g);
      expect(line).toContain('מתרגש ');
      expect(line).not.toMatch(/מתרגשת|\/ת/);
    }
  });
});
