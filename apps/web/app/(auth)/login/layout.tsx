import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'התחברות',
  description: 'התחברות לחשבון NuraWell.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/login' },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
