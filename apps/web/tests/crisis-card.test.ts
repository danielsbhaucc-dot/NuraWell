import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { detectCrisisSignals } from '../lib/safety/crisis-detector';

describe('chat crisis safety net', () => {
  it('detects self-harm / purging / starving deterministically', () => {
    for (const t of ['אני לא רוצה לחיות יותר', 'הקאתי אחרי הארוחה שוב', 'אני מרעיבה את עצמי']) {
      expect(detectCrisisSignals(t).redFlag, t).toBe(true);
    }
    expect(detectCrisisSignals('היה לי יום קשה בעבודה').redFlag).toBe(false);
  });
  it('card always contains the fixed resources', () => {
    const src = readFileSync('components/safety/CrisisResourcesCard.tsx', 'utf8');
    for (const n of ['r.eran.phone', 'r.medicalEmergency.phone', 'r.policeEmergency.phone', 'sahar.org.il']) expect(src).toContain(n);
    const chat = readFileSync('components/ai/AIChatWidget.tsx', 'utf8');
    expect(chat).toContain('<CrisisResourcesCard />');
  });
});
