'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import {
  User, Award, BookOpen, Flame, LogOut, ChevronLeft, Shield, Settings, Save, X, Bell
} from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ProfileData {
  id: string;
  full_name: string | null;
  role: string;
  avatar_url: string | null;
  created_at: string;
  streak_days: number | null;
  onboarding_completed: boolean | null;
  goal_weight_kg: number | null;
  current_weight_kg: number | null;
  height_cm: number | null;
  activity_level: string | null;
  gender: 'male' | 'female' | null;
}

interface ProfilePageClientProps {
  profile: ProfileData | null;
  email: string;
  totalCompleted: number;
  enrolledCount: number;
}

const activityLabels: Record<string, string> = {
  sedentary:   'יושבני',
  light:       'פעילות קלה',
  moderate:    'פעילות בינונית',
  active:      'פעיל',
  very_active: 'פעיל מאוד',
};

export function ProfilePageClient({ profile, email, totalCompleted, enrolledCount }: ProfilePageClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.full_name ?? '');
  const [genderInput, setGenderInput] = useState<'male' | 'female' | ''>(profile?.gender ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('he-IL', { year: 'numeric', month: 'long' })
    : '';

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : email[0]?.toUpperCase() ?? 'U';
  const firstName = (profile?.full_name || email.split('@')[0] || 'משתמש').trim().split(/\s+/)[0] || 'משתמש';

  const stats = [
    { label: 'שיעורים הושלמו', value: totalCompleted, icon: Award,    color: '#10b981' },
    { label: 'קורסים פעילים',  value: enrolledCount,  icon: BookOpen, color: '#14b8a6' },
    { label: 'רצף ימים',       value: profile?.streak_days ?? 0, icon: Flame, color: '#f97316' },
  ];

  const opsUrl = process.env.NEXT_PUBLIC_OPS_URL?.replace(/\/$/, '');
  const profileMenuItems = [
    ...(profile?.role === 'admin' && opsUrl
      ? [{ label: 'פאנל ניהול', href: `${opsUrl}/`, icon: Shield, emoji: '🛠️' }]
      : []),
    { label: 'התראות מאלמוג', href: '/settings/almog', icon: Bell, emoji: '🔔' },
    { label: 'ההתקדמות שלי', href: '/progress', icon: Award, emoji: '📊' },
    { label: 'הקורסים שלי', href: '/courses', icon: BookOpen, emoji: '📚' },
  ];

  const saveProfile = async () => {
    const cleanName = nameInput.trim();
    if (cleanName.length < 2) {
      setSaveError('יש להזין שם מלא תקין.');
      return;
    }

    setSavingProfile(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/v1/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: cleanName,
          gender: genderInput || null,
        }),
      });
      if (!res.ok) {
        throw new Error('save_failed');
      }

      setIsEditOpen(false);
      startTransition(() => router.refresh());
    } catch {
      setSaveError('לא הצלחנו לשמור כרגע. נסה שוב בעוד רגע.');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="min-h-full">
      <div className="container-mobile py-6 pb-10 space-y-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex items-start justify-between"
        >
          <div>
            <h1 className="text-2xl font-black text-slate-900 mb-1">הפרופיל שלי 👤</h1>
            <p className="text-slate-600 text-sm">נהל את הפרופיל האישי שלך</p>
          </div>
          <button
            type="button"
            onClick={() => setIsEditOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700 shadow-sm transition hover:bg-emerald-50"
            aria-label="עריכת פרופיל"
          >
            <Settings className="h-4 w-4" />
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.03 }}
          className="rounded-2xl border border-emerald-900/10 px-4 py-3 shadow-inner"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.82) 0%, rgba(236,253,245,0.55) 100%)',
            boxShadow: '0 10px 28px rgba(6,78,59,0.08), inset 0 1px 0 rgba(255,255,255,0.75)',
          }}
        >
          <p className="text-sm font-bold text-emerald-900">שלום, {firstName}</p>
        </motion.div>

        {/* Avatar + Name Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-3xl border border-emerald-900/10 p-5 backdrop-blur-md"
          style={{
            background: 'linear-gradient(165deg, rgba(255,255,255,0.88) 0%, rgba(236,253,245,0.35) 100%)',
            boxShadow: '0 14px 36px rgba(6,78,59,0.11)',
          }}
        >
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #14b8a6, #10b981)', boxShadow: '0 8px 24px rgba(20,184,166,0.4)' }}
            >
              {initials}
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-lg font-black text-slate-900 line-clamp-1">
                {profile?.full_name || 'משתמש NuraWell'}
              </p>
              <p className="text-sm text-slate-500 line-clamp-1">{email}</p>
              <div className="flex items-center gap-2 mt-1.5">
                {profile?.role === 'admin' && (
                  <span className="badge-accent text-xs">
                    <Shield className="w-3 h-3 inline-block ml-0.5" /> מנהל
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  חבר מאז {memberSince}
                  {profile?.gender === 'male' ? ' • זכר' : profile?.gender === 'female' ? ' • נקבה' : ''}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="grid grid-cols-3 gap-4"
        >
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-emerald-900/10 p-3 text-center backdrop-blur-sm"
              style={{
                background: 'rgba(255,255,255,0.72)',
                boxShadow: '0 8px 24px rgba(6,78,59,0.08)',
              }}
            >
              <div className="w-8 h-8 rounded-xl mx-auto mb-1.5 flex items-center justify-center"
                style={{ background: `${s.color}22`, border: `1px solid ${s.color}44` }}>
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
              <p className="text-xl font-black text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Personal Info */}
        {(profile?.current_weight_kg || profile?.goal_weight_kg || profile?.height_cm) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-3xl border border-emerald-900/10 p-5 backdrop-blur-md"
            style={{
              background: 'linear-gradient(165deg, rgba(255,255,255,0.9) 0%, rgba(240,253,250,0.4) 100%)',
              boxShadow: '0 14px 36px rgba(6,78,59,0.1)',
            }}
          >
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-primary-400" />
              פרטים אישיים
            </h3>
            <div className="space-y-3">
              {profile?.current_weight_kg && (
                <InfoRow label="משקל נוכחי" value={`${profile.current_weight_kg} ק"ג`} />
              )}
              {profile?.goal_weight_kg && (
                <InfoRow label="משקל יעד" value={`${profile.goal_weight_kg} ק"ג`} />
              )}
              {profile?.height_cm && (
                <InfoRow label="גובה" value={`${profile.height_cm} ס"מ`} />
              )}
              {profile?.activity_level && (
                <InfoRow label="רמת פעילות" value={activityLabels[profile.activity_level] ?? profile.activity_level} />
              )}
            </div>
          </motion.div>
        )}

        {/* Menu Items */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-3xl border border-emerald-900/10 overflow-hidden backdrop-blur-md"
          style={{
            padding: 0,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(248,250,249,0.85) 100%)',
            boxShadow: '0 14px 36px rgba(6,78,59,0.09)',
          }}
        >
          {profileMenuItems.map((item, idx, arr) => (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              prefetch
              className="flex items-center gap-3 p-4 hover:bg-emerald-50/60 transition-colors"
              style={idx < arr.length - 1 ? { borderBottom: '1px solid rgba(6,78,59,0.08)' } : {}}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                {item.emoji}
              </div>
              <span className="flex-1 text-sm font-semibold text-slate-700">{item.label}</span>
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </Link>
          ))}
        </motion.div>

        {/* Sign Out */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full flex items-center justify-center gap-2 rounded-2xl p-4 font-bold text-red-700 transition-all active:scale-98"
            style={{
              background: 'linear-gradient(135deg, rgba(254,226,226,0.92), rgba(254,202,202,0.85))',
              border: '1px solid rgba(248,113,113,0.45)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
            }}
          >
            {isSigningOut ? (
              <div className="w-5 h-5 border-2 border-red-700/30 border-t-red-700 rounded-full animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            התנתקות
          </button>
        </motion.div>

      </div>

      {isEditOpen && (
        <div
          className="fixed inset-0 z-[280] flex items-start justify-center bg-slate-900/45 p-3 pt-20 sm:items-center sm:pt-3"
          style={{ paddingTop: 'max(5rem, env(safe-area-inset-top))' }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-2xl">
            <div
              className="flex items-center justify-between px-4 py-3 text-white"
              style={{ background: 'linear-gradient(145deg, #047857, #10b981)' }}
            >
              <h3 className="text-lg font-black">עריכת פרופיל</h3>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/90 hover:bg-white/15"
                aria-label="סגור"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5">
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">שם מלא</label>
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400"
                    placeholder="הכנס שם מלא"
                    dir="rtl"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">מגדר</label>
                  <select
                    value={genderInput}
                    onChange={(e) => setGenderInput((e.target.value as 'male' | 'female' | '') ?? '')}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400"
                  >
                    <option value="">ללא בחירה</option>
                    <option value="male">זכר</option>
                    <option value="female">נקבה</option>
                  </select>
                </div>
              </div>

              {saveError && <p className="mt-3 text-sm font-semibold text-red-600">{saveError}</p>}

              <button
                type="button"
                onClick={saveProfile}
                disabled={savingProfile || isPending}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {savingProfile ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                שמירה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-slate-800">{value}</span>
    </div>
  );
}
