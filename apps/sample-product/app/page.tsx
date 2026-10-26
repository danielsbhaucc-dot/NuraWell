import { serverAuth } from '@/lib/server-auth';
import { AskForm } from './AskForm';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { auth, mode } = await serverAuth();
  const user = await auth.getUser();
  return (
    <main style={{ maxWidth: 640, margin: '48px auto', padding: '0 16px', display: 'grid', gap: 16 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 32 }}>מוצר לדוגמה</h1>
        <p style={{ margin: '6px 0 0', opacity: 0.8 }}>
          מוצר קטן שמשתמש באותה כניסה, באותו מנוע AI ובאותו עיצוב של NuraWell, ומופיע בלוח הבקרה המרכזי.
        </p>
      </header>
      <section className="card">
        <p style={{ marginTop: 0 }}>
          {user ? 'אתם מחוברים.' : 'אתם לא מחוברים.'} {mode === 'demo' ? '(מצב הדגמה מקומי)' : ''}
        </p>
        <AskForm />
      </section>
    </main>
  );
}
