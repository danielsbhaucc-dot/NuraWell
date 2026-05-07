import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'פאנל ניהול | NuraWell',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: '#f8faf9' }}>
      {/* Admin header */}
      <header className="sticky top-0 z-40 border-b"
        style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderColor: 'rgba(0,0,0,0.06)' }}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-lg font-black" style={{ color: '#047857', fontFamily: "'Rubik','Heebo',sans-serif" }}>
              🛠️ פאנל ניהול
            </Link>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="font-semibold text-gray-600 hover:text-emerald-700 transition-colors">
              צעדי מסע
            </Link>
            <Link href="/courses" className="font-semibold text-gray-400 hover:text-gray-600 transition-colors">
              חזרה לאפליקציה ←
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
