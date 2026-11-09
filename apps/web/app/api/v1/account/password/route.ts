import type { NextRequest } from 'next/server';
import { changePassword } from '@/lib/central/parent-password-change';

/** Change password (parent identity is the source of truth). Logic: lib/central/parent-password-change.ts. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// skipcq: JS-0067 -- Next.js route handler export
export async function POST(request: NextRequest) {
  return changePassword(request);
}
