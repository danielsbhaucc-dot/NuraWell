import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { runLocalDummyProof } from '../../../lab/scripts/prove-audit-dummy-local';

const local = spawnSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'postgres', '-At', '-c', 'select 1'], { encoding: 'utf8' });

describe('local dummy postgres', () => {
  it('seals reason and summary under real roles and RLS', async () => {
    if (local.status !== 0) return;
    process.env.PII_LOCAL_PROOF = 'dummy';
    const report = await runLocalDummyProof();
    expect(report).toMatchObject({
      pass: true,
      sealedReasonStored: true,
      sealedSummaryStored: true,
      legacyReasonRead: true,
      legacySummaryRead: true,
      decryptReason: true,
      decryptSummary: true,
      wrongKeyClosed: true,
      titleHidesCipher: true,
      authenticatedDenied: true,
      readerSeesNoRows: true,
      orderedByCreatedAt: true,
      reasonRewrite: true,
      summaryRewrite: true,
      rewrittenDecrypts: true,
      rlsEnabledNotForced: true,
      plaintextOver400Rejected: true,
    });
    expect(report.database).toBe('nurawell_pii_dummy');
  }, 60_000);
});
