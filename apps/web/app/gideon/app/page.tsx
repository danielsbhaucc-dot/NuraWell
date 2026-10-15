import Script from 'next/script';
import { headers } from 'next/headers';
import { GideonMiniApp } from '@/components/gideon/GideonMiniApp';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'גדעון', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

/** Telegram Mini App: Face ID (Telegram BiometricManager) for Gideon step-ups and device registration. */
export default async function Page() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" nonce={nonce} />
      <GideonMiniApp />
    </>
  );
}
