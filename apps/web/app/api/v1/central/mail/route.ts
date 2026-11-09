import type { NextRequest } from 'next/server';
import { deliverParentMail } from '@/lib/central/parent-mail';

/** Parent → NuraWell: deliver a parent reset link through NuraWell's mail. Logic: lib/central/parent-mail.ts. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// skipcq: JS-0067 -- Next.js route handler export
export async function POST(request: NextRequest) {
  return deliverParentMail(request);
}
