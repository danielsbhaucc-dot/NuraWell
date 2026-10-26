import { serverAuth } from '@/lib/server-auth';
import { AskForm } from './AskForm';
import { sampleLicenseFromEnv } from '@/lib/license';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { auth, mode } = await serverAuth();
  // Real deployments must hold a valid license from the central control plane; local demo mode skips it.
  const license = mode === 'demo' ? null : await sampleLicenseFromEnv().status();
  if (license && license.state !== 'active') {
    return <main style={{ maxWidth: 640, margin: '48px auto', padding: '0 16px' }}><p className="card">{license.message}</p></main>;
  }
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
