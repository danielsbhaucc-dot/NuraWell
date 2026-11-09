/**
 * UI-release: security/ops readers must never surface enc:v2 to unauthorized views.
 * Pure display-path coverage (findingTitle / readableFindingSignals / readableEnrollFact /
 * readableCountry). Does NOT re-run field-crypto seal suites.
 */
import { describe, expect, it } from 'vitest';
import { CLOSED_FINDING, findingTitle } from '@/lib/platform/access/finding-title';
import { readableFindingSignals } from '@/lib/platform/access/finding-signals';
import { readableEnrollFact } from '@/lib/ops/enroll-facts';
import { readableCountry, readableTicketRef } from '@/lib/platform/access/grant-fields';

const SEALED = 'enc:v2:TESTCIPHERBLOB_NOT_A_REAL_KEY';
const LEGACY_SUMMARY = 'גישה חריגה בשעות הלילה';
const LEGACY_SIGNALS = ['odd_hours', 'new_country'];
const MIXED_SIGNALS = ['odd_hours', SEALED, 'new_device'];

/** Mirrors AccessAuditFindings.tsx open-row title + meta assembly (no React / no DB). */
function auditFindingView(row: { summary: string; signals: string[]; event_kind: string }) {
  const title = findingTitle(row.summary);
  const signals = readableFindingSignals(row.signals);
  const meta = `${row.event_kind} · ${signals.join(', ')}`;
  return { title, meta, signals };
}

describe('security UI readers — legacy + sealed compat, no enc leak', () => {
  it('findingTitle: legacy plaintext shown; sealed → CLOSED_FINDING; never returns enc:', () => {
    expect(findingTitle(LEGACY_SUMMARY)).toBe(LEGACY_SUMMARY);
    expect(findingTitle(SEALED)).toBe(CLOSED_FINDING);
    expect(findingTitle('enc:v1:old')).toBe(CLOSED_FINDING);
    expect(findingTitle('')).toBe(CLOSED_FINDING);
    expect(findingTitle(null)).toBe(CLOSED_FINDING);
    expect(findingTitle(SEALED)).not.toContain('enc:');
  });

  it('readableFindingSignals: legacy codes kept; sealed elements dropped; typed array shape', () => {
    expect(readableFindingSignals(LEGACY_SIGNALS)).toEqual(LEGACY_SIGNALS);
    expect(readableFindingSignals([SEALED, SEALED])).toEqual([]);
    expect(readableFindingSignals(MIXED_SIGNALS)).toEqual(['odd_hours', 'new_device']);
    expect(readableFindingSignals(null)).toEqual([]);
    expect(readableFindingSignals('not-array')).toEqual([]);
    for (const s of readableFindingSignals(MIXED_SIGNALS)) {
      expect(s.startsWith('enc:')).toBe(false);
    }
  });

  it('AccessAuditFindings mapping: sealed summary/signals never appear in title or meta', () => {
    const legacy = auditFindingView({ summary: LEGACY_SUMMARY, signals: LEGACY_SIGNALS, event_kind: 'pii_view' });
    expect(legacy.title).toBe(LEGACY_SUMMARY);
    expect(legacy.meta).toContain('odd_hours');
    expect(legacy.meta).not.toContain('enc:');

    const sealed = auditFindingView({ summary: SEALED, signals: [SEALED], event_kind: 'pii_view' });
    expect(sealed.title).toBe(CLOSED_FINDING);
    expect(sealed.signals).toEqual([]);
    expect(sealed.title).not.toContain('enc:');
    expect(sealed.meta).not.toContain('enc:');

    const mixed = auditFindingView({ summary: SEALED, signals: MIXED_SIGNALS, event_kind: 'pii_grant' });
    expect(mixed.title).toBe(CLOSED_FINDING);
    expect(mixed.signals).toEqual(['odd_hours', 'new_device']);
    expect(mixed.meta).not.toMatch(/enc:/);
  });

  it('readableEnrollFact: legacy label/location shown; sealed → empty (telegram/UI safe)', () => {
    expect(readableEnrollFact('Chrome · Mac')).toBe('Chrome · Mac');
    expect(readableEnrollFact('TLV, IL')).toBe('TLV, IL');
    expect(readableEnrollFact(SEALED)).toBe('');
    expect(readableEnrollFact('enc:v1:x')).toBe('');
    expect(readableEnrollFact(null)).toBe('');
    expect(readableEnrollFact(SEALED)).not.toContain('enc:');
  });

  it('readableCountry / readableTicketRef: legacy plaintext; sealed omitted from compare/display', () => {
    expect(readableCountry('IL')).toBe('IL');
    expect(readableCountry(SEALED)).toBeNull();
    expect(readableTicketRef('T-123')).toBe('T-123');
    expect(readableTicketRef(SEALED)).toBeNull();
  });
});
