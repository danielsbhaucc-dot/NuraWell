import { describe, expect, it } from 'vitest';
import { commercialAssessment, dossierGaps, GENERATOR_PROVIDER, pickTermsVersion, PROVIDER_TERMS, termsChanged, waybackTimestamp, type TermsSnapshot } from '@/lib/legal/media/terms-core';
import { GENERATORS } from '@/lib/legal/media/labels';

const S = (fetched_at: string, sha: string | null, url = 'https://suno.com/terms'): TermsSnapshot => ({ url, fetched_at, sha256: sha, http_status: 200 });

describe('provider terms library', () => {
  it('covers every generator with official urls', () => {
    for (const g of Object.keys(GENERATORS) as Array<keyof typeof GENERATORS>) {
      const p = GENERATOR_PROVIDER[g];
      if (g === 'other') expect(p).toBeNull(); else expect(PROVIDER_TERMS[p!].urls.every((u) => u.startsWith('https://'))).toBe(true);
    }
    expect(PROVIDER_TERMS.xai.urls).toContain('https://x.ai/legal/brand-guidelines');
    expect(GENERATORS.nano_banana.tos).toBe('https://policies.google.com/terms');
  });
  it('picks the version in force on the creation day', () => {
    const h = [S('2026-06-01T10:00:00Z', 'a'), S('2026-09-05T10:00:00Z', 'b')];
    expect(pickTermsVersion(h, 'https://suno.com/terms', '2026-06-04')).toEqual({ snap: h[0], exact: true });
    expect(pickTermsVersion(h, 'https://suno.com/terms', '2026-10-01')?.snap.sha256).toBe('b');
    expect(pickTermsVersion(h, 'https://suno.com/terms', '2026-01-01')).toEqual({ snap: h[0], exact: false });
    expect(pickTermsVersion([S('2026-06-01T10:00:00Z', null)], 'https://suno.com/terms', '2026-06-04')).toBeNull();
  });
  it('appends only on change', () => {
    const h = [S('2026-06-01T10:00:00Z', 'a')];
    expect(termsChanged(h, 'https://suno.com/terms', 'a')).toBe(false);
    expect(termsChanged(h, 'https://suno.com/terms', 'b')).toBe(true);
    expect(termsChanged([], 'https://suno.com/terms', 'a')).toBe(true);
    expect(termsChanged([], 'https://suno.com/terms', null)).toBe(false);
  });
  it('wayback timestamp', () => { expect(waybackTimestamp('2026-06-04')).toBe('20260604'); expect(waybackTimestamp(null)).toBeNull(); });
});

describe('rights dossier', () => {
  it('Suno free is non-commercial, Pro is commercial', () => {
    expect(commercialAssessment('suno', 'Free (חינם) בזמן היצירה').allowed).toBe('no');
    expect(commercialAssessment('suno', 'Pro').allowed).toBe('yes');
    expect(commercialAssessment('suno', null).allowed).toBe('conditional');
    expect(commercialAssessment('grok', 'SuperGrok').note_he).toContain('Created with Grok');
    expect(commercialAssessment('gemini_music', 'Google AI Pro').allowed).toBe('yes');
  });
  it('lists gaps', () => {
    expect(dossierGaps({ generator: 'suno', plan: 'Pro', created_on: '2026-06-04', sha256: 'x', receipt_ids: ['r'], terms_found: 1, terms_exact: 1 })).toEqual([]);
    expect(dossierGaps({ generator: 'suno', plan: 'Pro', created_on: '2026-06-04', sha256: 'x', receipt_ids: [], terms_found: 1, terms_exact: 0 })).toEqual(['receipt', 'terms_snapshot_from_creation_day']);
    expect(dossierGaps({ plan: 'Free' })).toEqual(['generator', 'created_on', 'file_sha256', 'terms_snapshot']);
  });
});
