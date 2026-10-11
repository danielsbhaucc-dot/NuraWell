'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ImagePlus,
  Link2,
  Loader2,
  Power,
  Trash2,
  Unplug,
} from 'lucide-react';
import { encodeImageToWebpBlob, isWebpEncodeUnsupportedError } from '@/lib/client/encodeAlmogAvatarWebp';

type UserOption = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
};

type LinkRow = {
  id: string;
  target_user_id: string;
  guest_name: string | null;
  reason: string;
  expires_at: string;
  revoked_at: string | null;
  claim_count: number;
  max_claims: number | null;
  requires_password: boolean;
  target_name: string | null;
  target_role: string | null;
  target_email: string | null;
  active_sessions: number;
  welcome_image_url: string | null;
  created_at: string;
};

const TTL_OPTIONS = [
  { minutes: 60, label: 'שעה' },
  { minutes: 120, label: 'שעתיים' },
  { minutes: 360, label: '6 שעות' },
  { minutes: 1440, label: 'יום' },
  { minutes: 4320, label: '3 ימים' },
  { minutes: 10080, label: 'שבוע' },
];

export function AdminDemoAccessPanel() {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [targetUserId, setTargetUserId] = useState('');
  const [reason, setReason] = useState('');
  const [guestName, setGuestName] = useState('');
  const [ttlMinutes, setTtlMinutes] = useState(120);
  const [password, setPassword] = useState('');
  const [maxClaims, setMaxClaims] = useState('');
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [userQuery, setUserQuery] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [linksRes, usersRes] = await Promise.all([
        fetch('/api/v1/admin/demo-access', { credentials: 'include' }),
        fetch('/api/v1/admin/users?limit=100', { credentials: 'include' }),
      ]);
      const linksData = await linksRes.json();
      const usersData = await usersRes.json();
      if (!linksRes.ok) {
        setError(linksData.error ?? 'טעינת קישורים נכשלה');
        return;
      }
      setLinks(linksData.links ?? []);
      if (usersRes.ok) {
        setUsers(
          (usersData.users ?? []).map((u: UserOption) => ({
            id: u.id,
            full_name: u.full_name,
            email: u.email,
            role: u.role,
          })),
        );
      }
    } catch {
      setError('שגיאת רשת');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredUsers = users.filter((u) => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.full_name ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const createLink = async () => {
    setBusy('create');
    setError(null);
    setCreatedUrl(null);
    try {
      const res = await fetch('/api/v1/admin/demo-access', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_user_id: targetUserId,
          reason: reason.trim(),
          guest_name: guestName.trim() || null,
          ttl_minutes: ttlMinutes,
          password: password.trim() || null,
          max_claims: maxClaims.trim() ? Number(maxClaims) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'יצירה נכשלה');
        return;
      }
      setCreatedUrl(data.demo_url);
      setReason('');
      setGuestName('');
      setPassword('');
      setMaxClaims('');
      await load();
    } catch {
      setError('שגיאת רשת');
    } finally {
      setBusy(null);
    }
  };

  const patchLink = async (id: string, action: 'revoke' | 'disconnect_sessions') => {
    setBusy(`${action}-${id}`);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/demo-access/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'הפעולה נכשלה');
        return;
      }
      await load();
    } catch {
      setError('שגיאת רשת');
    } finally {
      setBusy(null);
    }
  };

  const deleteLink = async (id: string) => {
    if (!confirm('למחוק את הקישור ולנתק את כל הסשנים?')) return;
    setBusy(`delete-${id}`);
    try {
      const res = await fetch(`/api/v1/admin/demo-access/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'מחיקה נכשלה');
        return;
      }
      await load();
    } catch {
      setError('שגיאת רשת');
    } finally {
      setBusy(null);
    }
  };

  const uploadWelcome = async (id: string, file: File) => {
    setBusy(`img-${id}`);
    setError(null);
    try {
      let blob: Blob;
      try {
        blob = await encodeImageToWebpBlob(file, 1600, 0.82);
      } catch (e) {
        setError(
          isWebpEncodeUnsupportedError(e)
            ? 'הדפדפן לא תומך בדחיסת WebP'
            : 'דחיסת התמונה נכשלה',
        );
        return;
      }
      const form = new FormData();
      form.append('file', blob, 'welcome.webp');
      const res = await fetch(`/api/v1/admin/demo-access/${id}/welcome-image`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'העלאה נכשלה');
        return;
      }
      await load();
    } catch {
      setError('שגיאת רשת');
    } finally {
      setBusy(null);
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('לא ניתן להעתיק ללוח');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        טוען קישורים…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <section className="rounded-3xl border border-teal-200/60 bg-gradient-to-br from-teal-50/80 via-white to-amber-50/50 p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-black text-slate-900">פתיחת גישת דמו</h2>
        <p className="mt-1 text-sm text-slate-600">
          לינק + סיבה + שם אורח (אופציונלי) + סיסמה זמנית (אופציונלי). האורח רואה את נתוני משתמש היעד
          כאילו מחובר אליו — בלי הרשאות מנהל.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">חיפוש משתמש יעד</span>
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="שם / אימייל / test / admin…"
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">משתמש יעד *</span>
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">בחרו משתמש…</option>
              {filteredUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {(u.full_name || 'ללא שם') +
                    (u.email ? ` · ${u.email}` : '') +
                    ` · ${u.role}`}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">סיבה / מטרה *</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="למשל: הדגמה למפתח / סקירת מוצר לרופא"
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">שם אורח (לא חובה)</span>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="דולב"
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">תוקף</span>
            <select
              value={ttlMinutes}
              onChange={(e) => setTtlMinutes(Number(e.target.value))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              {TTL_OPTIONS.map((o) => (
                <option key={o.minutes} value={o.minutes}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">סיסמה זמנית (לא חובה)</span>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="למשל: welcome-dolev"
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">מקס׳ כניסות (לא חובה)</span>
            <input
              type="number"
              min={1}
              max={500}
              value={maxClaims}
              onChange={(e) => setMaxClaims(e.target.value)}
              placeholder="ללא הגבלה"
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={busy === 'create' || !targetUserId || reason.trim().length < 2}
          onClick={createLink}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          צור קישור גישה
        </button>

        {createdUrl ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-3 py-3">
            <code className="min-w-0 flex-1 break-all text-xs text-emerald-950">{createdUrl}</code>
            <button
              type="button"
              onClick={() => copyUrl(createdUrl)}
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'הועתק' : 'העתק'}
            </button>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-black text-slate-900">קישורים קיימים</h2>
        {links.length === 0 ? (
          <p className="text-sm text-slate-500">עדיין אין קישורי דמו.</p>
        ) : (
          links.map((link) => {
            const expired = new Date(link.expires_at).getTime() <= Date.now();
            const revoked = Boolean(link.revoked_at);
            return (
              <article
                key={link.id}
                className="rounded-3xl border border-slate-200/70 bg-background-card/70 p-4 shadow-sm backdrop-blur-md sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">
                      {link.guest_name ? `${link.guest_name} · ` : ''}
                      {link.reason}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      יעד: {link.target_name || 'ללא שם'}
                      {link.target_email ? ` · ${link.target_email}` : ''} · דרגה במקור:{' '}
                      {link.target_role}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      תוקף: {new Date(link.expires_at).toLocaleString('he-IL')}
                      {expired ? ' (פג)' : ''}
                      {revoked ? ' · בוטל' : ''}
                      {' · '}
                      כניסות: {link.claim_count}
                      {link.max_claims != null ? `/${link.max_claims}` : ''}
                      {' · '}
                      סשנים פעילים: {link.active_sessions}
                      {link.requires_password ? ' · עם סיסמה' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                      <ImagePlus className="h-3.5 w-3.5" />
                      רקע
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={busy === `img-${link.id}`}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadWelcome(link.id, f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => patchLink(link.id, 'disconnect_sessions')}
                      className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"
                    >
                      {busy === `disconnect_sessions-${link.id}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Unplug className="h-3.5 w-3.5" />
                      )}
                      נתק סשנים
                    </button>
                    <button
                      type="button"
                      disabled={!!busy || revoked}
                      onClick={() => patchLink(link.id, 'revoke')}
                      className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 disabled:opacity-50"
                    >
                      {busy === `revoke-${link.id}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Power className="h-3.5 w-3.5" />
                      )}
                      בטל קישור
                    </button>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => deleteLink(link.id)}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      מחק
                    </button>
                  </div>
                </div>
                {link.welcome_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={link.welcome_image_url}
                    alt=""
                    className="mt-3 h-24 w-full rounded-2xl object-cover"
                  />
                ) : null}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
