import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Static contract; the live flow is verified in production with a synthetic account.
describe('parent is the password source of truth', () => {
  const change = readFileSync('lib/central/parent-password-change.ts', 'utf8');
  const mail = readFileSync('lib/central/parent-mail.ts', 'utf8');
  it('change-password asks the parent first and only then updates the local copy', () => {
    expect(change).toMatch(/sameOrigin|origin !== request\.nextUrl\.origin/);
    expect(change.indexOf('/id/password/set/')).toBeLessThan(change.indexOf('updateUserById'));
    expect(change).toMatch(/current_password: current/);
    expect(change).toMatch(/checkPasswordPolicy/);
  });
  it('reset mail needs a parent purpose token, is one-use, per-recipient limited, confirmed-only, never mails synthetic accounts', () => {
    expect(mail).toMatch(/verifyPurposeToken\(token, jwks as never, 'id-mail\+jwt'\)/);
    expect(mail).toMatch(/namespace: 'central-mail-jti', limit: 1/);
    expect(mail).toMatch(/central-mail-rcpt/);
    expect(mail).toMatch(/email_confirmed_at/);
    expect(mail.indexOf('synthetic === true')).toBeLessThan(mail.indexOf('sendResendEmail({'));
    expect(mail).toMatch(/linkOk\(link\)/);
  });
});
