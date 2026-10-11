import type { Metadata } from 'next';
import { DemoWelcomeClient } from '@/components/demo-access/DemoWelcomeClient';

export const metadata: Metadata = {
  title: 'גישת דמו | NuraWell',
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function DemoAccessPage({ params }: PageProps) {
  const { token } = await params;
  const safeToken = typeof token === 'string' ? token.trim() : '';

  if (!safeToken || safeToken.length < 20) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0b1f1c] px-6 text-center text-teal-50" dir="rtl">
        <p className="text-lg font-bold">קישור לא תקין.</p>
      </div>
    );
  }

  return <DemoWelcomeClient token={safeToken} />;
}
