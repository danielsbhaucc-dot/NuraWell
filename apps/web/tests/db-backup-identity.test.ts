import { describe, it, expect } from 'vitest';
import { buildKeyBackup } from '@/lib/security/key-backup-server';

const env = { PII_ENCRYPTION_KEY: 'a'.repeat(44) } as unknown as NodeJS.ProcessEnv;
const ID = `AGE-SECRET-KEY-1${'Q'.repeat(58)}`;

describe('key backup: optional DB-backup age identity', () => {
  it('includes a valid identity supplied at backup time', () => {
    const b = buildKeyBackup('correct-horse-battery-47', env, { DB_BACKUP_AGE_IDENTITY: ID });
    expect(b.inventory.map((i) => i.name)).toContain('DB_BACKUP_AGE_IDENTITY');
    expect(JSON.stringify(b)).not.toContain(ID);
  });
  it('ignores malformed identity', () => {
    const b = buildKeyBackup('correct-horse-battery-47', env, { DB_BACKUP_AGE_IDENTITY: 'nope' });
    expect(b.inventory.map((i) => i.name)).not.toContain('DB_BACKUP_AGE_IDENTITY');
  });
});
