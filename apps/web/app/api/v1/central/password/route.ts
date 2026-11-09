import type { NextRequest } from 'next/server';
import { centralPasswordLogin } from '@/lib/central/parent-password';

/** Central sign-in from the unchanged login screen. Logic: lib/central/parent-password.ts. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

// skipcq: JS-0067 -- Next.js route handler export
export async function POST(request: NextRequest) {
  return centralPasswordLogin(request);
}
