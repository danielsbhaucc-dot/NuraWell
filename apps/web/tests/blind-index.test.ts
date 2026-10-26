import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { __resetFieldCrypto } from '@/lib/security/field-crypto';
import { blindIndexPatch, notificationUniqueScope, rewriteBlindFilters } from '@/lib/security/blind-index';
import { prepareWriteRow } from '@/lib/security/field-write';

const U1 = '11111111-1111-4111-8111-111111111111';
const EV = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

beforeEach(() => {
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  __resetFieldCrypto();
});

describe('blind indexes', () => {
  it('scopes only the two deduped notification sources', () => {
    expect(notificationUniqueScope({ source: 'almog_habit_checkpoint', checkpoint_date: '2026-10-26', slot: 'am' })).toBe('habit|2026-10-26|am');
    expect(notificationUniqueScope({ source: 'other' })).toBeNull();
  });

  it('title bidx is deterministic, keyed and never the plaintext', async () => {
    const a = await blindIndexPatch('challenge_success_events', { user_id: U1, title: 'ריצה' });
    const b = await blindIndexPatch('challenge_success_events', { user_id: U1, title: 'ריצה' });
    expect(a.title_bidx).toBe(b.title_bidx);
    expect(String(a.title_bidx)).not.toContain('ריצה');
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    __resetFieldCrypto();
    const c = await blindIndexPatch('challenge_success_events', { user_id: U1, title: 'ריצה' });
    expect(c.title_bidx).not.toBe(a.title_bidx);
  });

  it('notification metadata gets key + unique bidx', async () => {
    const p = await blindIndexPatch('notifications', { user_id: U1, metadata: { dedupe_key: 'k1', source: 'almog_habit_checkpoint', checkpoint_date: 'd', slot: 's' } });
    expect(p.meta_key_bidx).toBeTruthy();
    expect(p.meta_unique_bidx).toBeTruthy();
  });

  it('rewrites title=eq filters to the bidx (with legacy plaintext fallback)', async () => {
    const url = new URL('https://x.supabase.co/rest/v1/challenge_success_events?user_id=eq.u&title=eq.abc');
    expect(await rewriteBlindFilters('challenge_success_events', url)).toBe(true);
    expect(url.searchParams.get('title')).toBeNull();
    expect(url.searchParams.get('or')).toContain('title_bidx.eq.');
  });

  it('user_consents mirrors evidence_id/request_id/choice to plain columns', async () => {
    const r = await prepareWriteRow('user_consents', { user_id: U1, metadata: { evidence_id: EV, request_id: 'req-1', choice: 'accept' } });
    expect(r.evidence_id).toBe(EV);
    expect(r.request_id).toBe('req-1');
    expect(r.choice).toBe('accept');
    const bad = await prepareWriteRow('user_consents', { user_id: U1, metadata: { evidence_id: 'not-a-uuid' } });
    expect(bad.evidence_id ?? null).toBeNull();
  });
});
