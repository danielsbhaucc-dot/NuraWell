import { describe, expect, it } from 'vitest';
import { clientFingerprint } from '@/lib/ops/handoff';

const H = (ua: string, ip: string, cf?: string) => new Headers({ 'user-agent': ua, 'x-real-ip': ip, ...(cf ? { 'cf-connecting-ip': cf } : {}) });

describe('handoff client binding', () => {
  it('survives the IP change between vercel.app and Cloudflare-proxied ops host', () => {
    expect(clientFingerprint(H('Chrome/141 Android', '2a00:a040::1'))).toBe(clientFingerprint(H('Chrome/141 Android', '172.68.1.1', '31.154.2.3')));
  });
  it('still rejects a different browser', () => {
    expect(clientFingerprint(H('Chrome/141 Android', '1.1.1.1'))).not.toBe(clientFingerprint(H('Firefox/130 Windows', '1.1.1.1')));
  });
});
