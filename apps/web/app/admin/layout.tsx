import type { Metadata } from 'next';
import Link from 'next/link';
import { ensureAdminServer } from '../../lib/auth/ensure-admin-server';

export const metadata: Metadata = {
  title: 'פאנל ניהול | NuraWell',
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await ensureAdminServer();

  return (
    <div className="min-h-screen touch-manipulation" style={{ background: '#f8faf9' }}>
      <header
        className="sticky top-0 z-40 border-b safe-area-top"
        style={{
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px)',
          borderColor: 'rgba(0,0,0,0.06)',
        }}
      >
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 min-h-14 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2 sm:py-0">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link
              href="/admin"
              className="text-base sm:text-lg font-black min-h-11 inline-flex items-center"
              style={{ color: '#047857', fontFamily: "'Rubik','Heebo',sans-serif" }}
            >
              🛠️ פאנל ניהול
            </Link>
          </div>
          <nav className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm sm:text-base" aria-label="ניווט פאנל ניהול">
            <Link
              href="/admin"
              className="font-semibold text-gray-600 hover:text-emerald-700 transition-colors min-h-11 inline-flex items-center px-2 rounded-xl active:bg-gray-100/80"
            >
              צעדי מסע
            </Link>
            <Link
              href="/courses"
              className="font-semibold text-gray-400 hover:text-gray-600 transition-colors min-h-11 inline-flex items-center px-2 rounded-xl active:bg-gray-100/80"
            >
              חזרה לאפליקציה ←
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content" className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 safe-area-bottom">
        {children}
      </main>
    </div>
  );
}
