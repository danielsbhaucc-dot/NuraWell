import { describe, expect, it } from 'vitest';
import {
  createRawUiStreamFilter,
  encodeResolvedChatUi,
  extractResolvedChatUi,
  parseRawChatUi,
  resolveChatUi,
  stripAllChatUiMarkers,
  stripRawChatUi,
} from '../lib/ai/chat-ui/blocks';

const plan = [
  { id: 'a1', status: 'accepted', canStepDown: true, canStepUp: false, level: { title: 'לשתות 2 כוסות מים' }, definition: { emoji: '💧' } },
  { id: 'a2', status: 'accepted', canStepDown: false, canStepUp: true, level: { title: 'הליכה 10 דקות' }, definition: { emoji: null } },
  { id: 'a3', status: 'paused', canStepDown: true, canStepUp: true, level: { title: 'מושהית' }, definition: { emoji: null } },
];

describe('raw UI stream filter', () => {
  it('hides a marker split across many chunks and keeps the text', () => {
    const f = createRawUiStreamFilter();
    const full = 'מבין אותך. עם מה קשה?\n⟦NW_UI:{"pick":"struggle","chips":["מים","הליכה"]}⟧';
    let out = '';
    for (const ch of full) out += f.push(ch);
    out += f.flush();
    expect(out).toBe('מבין אותך. עם מה קשה?\n');
    expect(parseRawChatUi(f.rawJson()!)?.pick).toBe('struggle');
  });
  it('releases a look-alike prefix that is not a marker', () => {
    const f = createRawUiStreamFilter();
    expect(f.push('שלום ⟦NW') + f.push('_X⟧ סוף') + f.flush()).toBe('שלום ⟦NW_X⟧ סוף');
    expect(f.rawJson()).toBeNull();
  });
  it('strips raw markers from persisted text', () => {
    expect(stripRawChatUi('טקסט ⟦NW_UI:{"chips":["כן"]}⟧')).toBe('טקסט');
  });
});

describe('resolveChatUi', () => {
  it('uses real task ids, never model ids; drops invalid level moves and paused tasks', () => {
    const raw = parseRawChatUi(
      JSON.stringify({ pick: 'struggle', do: [{ t: 'easier', n: 1 }, { t: 'easier', n: 2 }, { t: 'harder', n: 3 }, { t: 'easier', n: 99 }, { t: 'goal', text: 'לרדת 5 ק״ג עד הקיץ' }, { t: 'habit', title: 'מים בכוס גדולה ליד המיטה', n: 1 }] })
    )!;
    const ui = resolveChatUi(raw, plan);
    expect(ui.pick?.options.map((o) => o.id)).toEqual(['a1', 'a2']);
    expect(ui.proposals).toEqual([
      { kind: 'level', assignmentId: 'a1', direction: 'easier', title: 'לשתות 2 כוסות מים' },
      { kind: 'goal', text: 'לרדת 5 ק״ג עד הקיץ' },
      { kind: 'habit', title: 'מים בכוס גדולה ליד המיטה', replaces: 'לשתות 2 כוסות מים' },
    ]);
  });
  it('caps proposals at 3 and chips at 4, cleans marker chars', () => {
    const raw = parseRawChatUi(JSON.stringify({ chips: ['א⟧ב', 'ג', 'ד', 'ה', 'ו', 'ג'] }))!;
    expect(raw.chips).toEqual(['א ב', 'ג', 'ד', 'ה']);
  });
  it('round-trips the resolved marker and hides it from display', () => {
    const m = `שלום${encodeResolvedChatUi({ chips: ['כן'] })}`;
    expect(extractResolvedChatUi(m)).toEqual({ chips: ['כן'] });
    expect(stripAllChatUiMarkers(m)).toBe('שלום');
    expect(stripAllChatUiMarkers('שלום⟦NW_UIR:{"chi')).toBe('שלום');
  });
  it('rejects garbage', () => {
    expect(parseRawChatUi('not json')).toBeNull();
    expect(parseRawChatUi('[1]')).toBeNull();
  });
});
