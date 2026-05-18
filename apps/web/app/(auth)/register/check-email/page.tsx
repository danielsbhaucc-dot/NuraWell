import { CheckEmailClient } from '@/components/onboarding/CheckEmailClient';
import { createClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'אימות אימייל | NuraWell',
};

export default async function RegisterCheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  const sp = await searchParams;
  const hasError = sp.error === 'auth';

  let email = sp.email?.trim() ?? '';
  if (!email) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? '';
  }

  return (
    <main
      id="main-content"
      className="onboarding-shell-dark min-h-[100dvh] flex flex-col items-center justify-center px-4 py-12"
    >
      <CheckEmailClient email={email} hasAuthError={hasError} />
    </main>
  );
}
