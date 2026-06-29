import { createHmac, timingSafeEqual } from 'node:crypto';

export type ChallengeDemoTokenPayload = {
  adminId: string;
  scenario: 'waiting' | 'intro' | 'active' | 'wrap_up';
  simulatedDay?: number;
  exp: number;
};

const TOKEN_TTL_MS = 15 * 60 * 1000;

function demoSecret(): string {
  const secret =
    process.env.CRON_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) {
    throw new Error('CRON_SECRET required for challenge demo tokens');
  }
  return secret;
}

function signPayload(payloadB64: string): string {
  return createHmac('sha256', demoSecret()).update(payloadB64).digest('base64url');
}

export function createChallengeDemoToken(
  adminId: string,
  scenario: ChallengeDemoTokenPayload['scenario'],
  simulatedDay?: number,
): string {
  const payload: ChallengeDemoTokenPayload = {
    adminId,
    scenario,
    simulatedDay,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function verifyChallengeDemoToken(token: string): ChallengeDemoTokenPayload | null {
  try {
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return null;

    const expected = signPayload(payloadB64);
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as ChallengeDemoTokenPayload;
    if (!payload.adminId || !payload.scenario || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export { TOKEN_TTL_MS };
