import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAdminUser } from '@/lib/auth/passkeys';

const src = (p: string) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const db = (role: string | null) =>
  ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: role ? { role } : null }) }) }) }) }) as never;

describe('backup codes are admin-only', () => {
  it('isAdminUser only true for role=admin', async () => {
    expect(await isAdminUser(db('admin'), 'u')).toBe(true);
    expect(await isAdminUser(db('user'), 'u')).toBe(false);
    expect(await isAdminUser(db('test'), 'u')).toBe(false);
    expect(await isAdminUser(db(null), 'u')).toBe(false);
  });
  it('redeem route never redeems for non-admins and uses the same generic failure', () => {
    const s = src('app/api/v1/auth/backup-code/route.ts');
    expect(s).toMatch(/admin \? await redeemBackupCode/);
    expect(s).not.toMatch(/admin only|not an admin|לא מנהל/i);
  });
  it('generate action rejected for non-admins; GET hides count', () => {
    const s = src('app/api/v1/account/security/route.ts');
    expect(s).toMatch(/regenerate-codes'\) \{\n\s+if \(!c\.isAdmin\) return json\(\{ error: 'bad_request' \}, 400\)/);
    expect(s).toMatch(/c\.isAdmin \? await backupCodesLeft/);
  });
});
