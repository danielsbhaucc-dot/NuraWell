import { describe, expect, it } from 'vitest';
import { labMissing, labTitle } from '@/tests/support/local-lab';
import { runLocalDummyProof } from '../../../lab/scripts/prove-audit-dummy-local';

// Was a silent `return` (counted as a pass) without Postgres; now an explicit, named skip.
const LAB = labMissing([{ kind: 'pg-superuser' }]);

describe.skipIf(!!LAB)(labTitle('local dummy postgres', LAB), () => {
  it('seals reason and summary under real roles and RLS', async () => {
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
