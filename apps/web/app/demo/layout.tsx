import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  title: 'גישת דמו',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0b1f1c',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/** נעילת רקע כהה לפני hydration — מונע הבזק לבן מ-body.bg-background */
const DEMO_LOCK_SCRIPT =
  "document.documentElement.classList.add('demo-welcome-lock');" +
  "if(document.body)document.body.classList.add('demo-welcome-lock');";

/** דף כניסת דמו — בלי מעטפת בהירה; הרקע מנוהל ב-DemoWelcomeClient + demo-welcome-lock */
export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <>
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: DEMO_LOCK_SCRIPT }} />
      {children}
    </>
  );
}
