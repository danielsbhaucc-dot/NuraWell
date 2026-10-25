import 'server-only';
import snapshot from '@/lib/generated/deps-snapshot.json';
import type { SecmonConfig } from '@/lib/platform/secmon';

/** NuraWell's settings for the platform security monitor (the module itself is product-agnostic). */
export const HEARTBEATS = [
  { source: 'vercel.secmon', label: 'סריקת האבטחה הלילית באפליקציה', maxAgeHours: 48 },
  { source: 'vercel.db-backup', label: 'גיבוי מסד הנתונים הלילי', maxAgeHours: 48 },
  { source: 'gh.nightly-security', label: 'סריקת הקוד הלילית ב-GitHub', maxAgeHours: 48 },
  { source: 'grok.nightly', label: 'הסריקה הלילית של Grok Bot', maxAgeHours: 48 },
] as const;

export const SECMON_HEARTBEAT_SOURCES: ReadonlySet<string> = new Set(HEARTBEATS.map((h) => h.source));

export function secmonConfig(): SecmonConfig {
  return {
    deps: (snapshot as { deps: { name: string; version: string }[] }).deps,
    watchPackages: ['next', 'react', 'react-dom', '@supabase/supabase-js', '@supabase/ssr', '@simplewebauthn/server', '@simplewebauthn/browser', 'zod', '@aws-sdk/client-s3', '@upstash/qstash', 'resend'],
    kevKeywords: ['next.js', 'nextjs', 'vercel', 'react', 'node.js', 'nodejs', 'supabase', 'postgresql', 'telegram'],
    sites: ['https://nurawell.vercel.app/', 'https://ops.nurawell.ai/', 'https://www.nurawell.ai/'],
    heartbeats: HEARTBEATS.map((h) => ({ ...h })),
    tlsWarnDays: 14,
  };
}
