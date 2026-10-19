import { describe, expect, it, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { __resetPiiKeyCache, isEncrypted, decryptDossierRow, encryptJson } from '@/lib/crypto/pii';
import { encryptTableRow, decryptTableRow, needsTextEncryption } from '@/lib/crypto/pii-fields';

const U = '00000000-0000-0000-0000-000000000001';
beforeAll(() => { process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64'); __resetPiiKeyCache(); });

describe('newly encrypted sensitive fields', () => {
  it('encrypts commitment job text and round-trips', () => {
    const enc = encryptTableRow('pending_almog_commitment_jobs', { user_message: 'אכלתי בלילה', assistant_message: 'הבנתי', rolling_summary: null }, U);
    expect(isEncrypted(enc.user_message)).toBe(true);
    expect(enc.rolling_summary).toBeNull();
    expect(decryptTableRow('pending_almog_commitment_jobs', enc, U).user_message).toBe('אכלתי בלילה');
  });
  it('keeps technical sentinel plaintext so eq() filters still work', () => {
    expect(encryptTableRow('almog_assignments', { source_excerpt: 'chat_card_confirm' }, U).source_excerpt).toBe('chat_card_confirm');
    expect(needsTextEncryption('chat_card_confirm')).toBe(false);
    expect(needsTextEncryption('ציטוט')).toBe(true);
  });
  it('encrypts task execution note and dossier personal_context', () => {
    expect(isEncrypted(encryptTableRow('journey_task_executions', { note: 'x' }, U).note)).toBe(true);
    const row = decryptDossierRow({ personal_context: encryptJson({ work: 'a' }, U) }, U);
    expect(row.personal_context).toEqual({ work: 'a' });
  });
});
