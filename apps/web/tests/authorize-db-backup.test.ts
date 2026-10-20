import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/api/authorize-cron', () => ({ authorizeCronRequest: vi.fn(async () => new Response('no', { status: 401 })) }));
import { authorizeDbBackupRequest } from '@/lib/api/authorize-db-backup';
const S = 'x'.repeat(48);
const req = (h?: string) => new Request('https://a.test/api/v1/ops/db-backup', { method: 'POST', headers: h ? { authorization: h } : {} });
describe('authorizeDbBackupRequest', () => {
  beforeEach(() => { process.env.DB_BACKUP_SECRET = S; });
  it('accepts the dedicated secret', async () => expect(await authorizeDbBackupRequest(req(`Bearer ${S}`))).toBeNull());
  it('falls back to cron auth otherwise', async () => expect((await authorizeDbBackupRequest(req('Bearer wrong')))?.status).toBe(401));
  it('ignores a too-short dedicated secret', async () => { process.env.DB_BACKUP_SECRET = 'short'; expect((await authorizeDbBackupRequest(req('Bearer short')))?.status).toBe(401); });
});
