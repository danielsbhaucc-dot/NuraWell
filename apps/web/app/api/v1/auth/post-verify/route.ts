import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendWelcomeDolevEmail } from '@/lib/auth/send-welcome-dolev-email';
import { scheduleWelcomeAfterVerify } from '@/lib/auth/schedule-welcome-after-verify';
import { scheduleAlmogKickoff } from '@/lib/auth/schedule-almog-kickoff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** אחרי אימות (OTP / polling) — שליחת מייל דולב + תזמון גיבוי + פנייה ראשונה מאלמוג */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });
  }
  if (!user.email_confirmed_at) {
    return NextResponse.json({ error: 'אימייל לא מאומת' }, { status: 400 });
  }

  const emailResult = await sendWelcomeDolevEmail(user.id);
  try {
    await scheduleWelcomeAfterVerify(user.id);
  } catch (e) {
    console.warn('[post-verify] welcome schedule failed', e);
  }
  try {
    await scheduleAlmogKickoff(user.id);
  } catch (e) {
    console.warn('[post-verify] almog kickoff schedule failed', e);
  }

  return NextResponse.json({
    ok: true,
    email: emailResult,
  });
}
