import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scheduleAlmogKickoff } from '@/lib/auth/schedule-almog-kickoff';
import { scheduleWelcomeAfterVerify } from '@/lib/auth/schedule-welcome-after-verify';
import { sendWelcomeDolevEmail } from '@/lib/auth/send-welcome-dolev-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') ?? '/register/verified';

  if (code || tokenHash) {
    const supabase = await createClient();
    const { error } =
      code ?
        await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({
          type: (type as 'signup' | 'email') || 'signup',
          token_hash: tokenHash!,
        });
    if (error) {
      return NextResponse.redirect(`${origin}/register/check-email?error=auth`);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.email_confirmed_at) {
      try {
        await sendWelcomeDolevEmail(user.id);
      } catch (e) {
        console.warn('[auth/callback] welcome email failed', e);
      }
      try {
        await scheduleWelcomeAfterVerify(user.id);
      } catch (e) {
        console.warn('[auth/callback] welcome schedule failed', e);
      }
      try {
        await scheduleAlmogKickoff(user.id);
      } catch (e) {
        console.warn('[auth/callback] almog kickoff schedule failed', e);
      }
    }
  }

  return NextResponse.redirect(`${origin}${next.startsWith('/') ? next : '/register/verified'}`);
}
