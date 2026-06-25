'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import {
  User, Award, BookOpen, Flame, LogOut, ChevronLeft, Shield, Settings, Save, X, Bell,
  MessageCircle, Pencil, Camera,
} from 'lucide-react';
import { ProfileRhythmCard, type ProfileRhythmInitial } from './ProfileRhythmCard';
import { signOutClient } from '../../lib/auth/sign-out-client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { OnboardingChat } from './OnboardingChat';
import { ProfileAvatarUpload } from './ProfileAvatarUpload';
import { ProfileSettingsDrawer } from './ProfileSettingsDrawer';
import { LegalLinksRow } from '../legal/LegalLinksRow';
import { AnimatedDialog } from '../shared/AnimatedDialog';
import { useProfileAvatarUrl } from '@/lib/client/useProfileAvatarUrl';
import {
  firstNameFrom,
  profileSubtitle,
  profileChatCta,
  genderLabel,
  memberSinceLabel,
} from '@/lib/profile/personalized-copy';
import { buildProfileSummaryRows } from '@/lib/onboarding/profile-summary-rows';

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
  main_goal: string | null;
  main_obstacle: string | null;
  main_obstacle_detail: string | null;
  weakest_time_of_day: string | null;
  wake_up_time: string | null;
  sleep_time: string | null;
}

interface ProfilePageClientProps {
  profile: ProfileData | null;
  email: string;
  totalCompleted: number;
  enrolledCount: number;
  rhythm: ProfileRhythmInitial;
}

const activityLabels: Record<string, string> = {
  sedentary: 'יושבני',
  light: 'פעילות קלה',
  moderate: 'פעילות בינונית',
  active: 'פעיל',
  very_active: 'פעיל מאוד',
};

type EditField = 'name' | 'gender' | 'weight' | 'height' | 'activity' | null;

export function ProfilePageClient({ profile, email, totalCompleted, enrolledCount, rhythm }: ProfilePageClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [editField, setEditField] = useState<EditField>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.full_name ?? '');
  const [genderInput, setGenderInput] = useState<'male' | 'female' | ''>(profile?.gender ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);
  const [avatarRefreshKey, setAvatarRefreshKey] = useState(0);

  const { avatarUrl, refresh: refreshAvatar, applyUploadedUrl } = useProfileAvatarUrl(
    profile?.id,
    avatarRefreshKey
  );

  const handleSignOut = async () => {
    setSignOutError(null);
    setIsSigningOut(true);
    const result = await signOutClient('/');
    if (!result.ok) {
      setSignOutError(result.error ?? 'לא הצלחנו להתנתק. נסה שוב.');
      setIsSigningOut(false);
    }
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('he-IL', { year: 'numeric', month: 'long' })
    : '';

  const firstName = firstNameFrom(profile?.full_name ?? null, email.split('@')[0] || 'חבר');
  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : email[0]?.toUpperCase() ?? 'U';

  const summaryRows = profile
    ? buildProfileSummaryRows({
        full_name: profile.full_name,
        gender: profile.gender,
        main_goal: profile.main_goal as 'weight_loss' | 'healthy_lifestyle' | 'both' | null,
        current_weight_kg: profile.current_weight_kg,
        goal_weight_kg: profile.goal_weight_kg,
        weakest_time_of_day: profile.weakest_time_of_day as 'morning' | 'noon' | 'afternoon' | 'evening_night' | null,
        main_obstacle: profile.main_obstacle as 'no_time' | 'emotional_eating' | 'lack_of_consistency' | 'no_support' | 'other' | null,
        main_obstacle_detail: profile.main_obstacle_detail,
        wake_up_time: profile.wake_up_time,
        sleep_time: profile.sleep_time,
        meal_schedule: rhythm.meal_times.map((t, i) => ({
          time: t,
          label: `ארוחה ${i + 1}`,
        })),
      })
    : [];

  const stats = [
    { label: 'פרקים הושלמו', value: totalCompleted, icon: Award, color: '#10b981' },
    { label: 'מדריכים פעילים', value: enrolledCount, icon: BookOpen, color: '#14b8a6' },
    { label: 'רצף ימים', value: profile?.streak_days ?? 0, icon: Flame, color: '#f97316' },
  ];

  const opsUrl = process.env.NEXT_PUBLIC_OPS_URL?.replace(/\/$/, '');
  const navItems = [
    ...(profile?.role === 'admin' && opsUrl
      ? [{ label: 'פאנל ניהול', href: `${opsUrl}/`, emoji: '🛠️' }]
      : []),
    { label: 'בית', href: '/home', emoji: '🏠' },
    { label: 'ההתקדמות שלי', href: '/progress', emoji: '📊' },
    { label: 'המדריכים שלי', href: '/guides', emoji: '📚' },
  ];

  const saveProfile = async () => {
    const cleanName = nameInput.trim();
    if (editField === 'name' && cleanName.length < 2) {
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
      if (!res.ok) throw new Error('save_failed');
      setEditField(null);
      startTransition(() => router.refresh());
    } catch {
      setSaveError('לא הצלחנו לשמור כרגע. נסה שוב בעוד רגע.');
    } finally {
      setSavingProfile(false);
    }
  };

  const openEdit = (field: EditField) => {
    setNameInput(profile?.full_name ?? '');
    setGenderInput(profile?.gender ?? '');
    setSaveError(null);
    setEditField(field);
  };

  const onAvatarUploaded = (url: string | null) => {
    applyUploadedUrl(url);
    setAvatarRefreshKey((k) => k + 1);
    void refreshAvatar();
    startTransition(() => router.refresh());
  };

  return (
    <div className="min-h-full">
      <div className="container-mobile py-6 pt-6 md:pt-16 pb-10 space-y-5">

        <motion.div
          dir="rtl"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="crystal-header rounded-3xl px-5 py-5 relative overflow-hidden"
        >
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.35) 0%, transparent 55%)',
            }}
          />

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="absolute left-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-2xl text-white transition hover:scale-[1.03] active:scale-95"
            style={{
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.25)',
              backdropFilter: 'blur(10px)',
            }}
            aria-label="הגדרות"
          >
            <Settings className="h-4 w-4" />
          </button>

          <div className="relative w-full pe-12">
            <h1 className="text-2xl font-black text-white tracking-tight text-right w-full">
              הפרופיל שלי
            </h1>
            <p className="mt-2 text-[15px] font-semibold leading-relaxed text-white/95 text-right w-full">
              {profileSubtitle(profile?.gender ?? null, firstName)}
            </p>
          </div>

          <div className="relative z-10 mt-4 flex justify-center px-1">
            <button
              type="button"
              onClick={() => setIsChatOpen(true)}
              className="inline-flex w-full max-w-[280px] items-center justify-center rounded-2xl px-4 py-3 text-sm font-bold text-white transition hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: 'rgba(255,255,255,0.14)',
                border: '1px solid rgba(255,255,255,0.28)',
                backdropFilter: 'blur(12px)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
              }}
              aria-label="עדכון פרופיל בשיחה עם אלמוג"
            >
              {profileChatCta(profile?.gender ?? null)}
            </button>
          </div>
        </motion.div>

        <OnboardingChat
          open={isChatOpen}
          onOpenChange={setIsChatOpen}
          onSaved={() => router.refresh()}
          profileSnapshot={profile}
          avatarRefreshKey={avatarRefreshKey}
        />
        <ProfileSettingsDrawer open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
        <ProfileAvatarUpload
          open={isAvatarOpen}
          onClose={() => setIsAvatarOpen(false)}
          currentInitials={initials}
          firstName={firstName}
          gender={profile?.gender ?? null}
          onUploaded={onAvatarUploaded}
        />

        <motion.div
          dir="rtl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="crystal-surface rounded-3xl p-5"
        >
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsAvatarOpen(true)}
              className="relative group shrink-0"
              aria-label="שנה תמונת פרופיל"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={profile?.full_name ?? 'פרופיל'}
                  className="w-[72px] h-[72px] rounded-2xl object-cover shadow-lg"
                  style={{ boxShadow: '0 8px 24px rgba(20,184,166,0.35)' }}
                  onError={() => {
                    void refreshAvatar();
                  }}
                />
              ) : (
                <div
                  className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center text-2xl font-black text-white"
                  style={{
                    background: 'linear-gradient(135deg, #14b8a6, #10b981)',
                    boxShadow: '0 8px 24px rgba(20,184,166,0.35)',
                  }}
                >
                  {initials}
                </div>
              )}
              <span className="absolute -bottom-1 -left-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md border-2 border-white group-hover:scale-110 transition">
                <Camera className="h-3.5 w-3.5" />
              </span>
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-lg font-black text-slate-900 line-clamp-1 flex-1">
                  {profile?.full_name || 'משתמש NuraWell'}
                </p>
                <button
                  type="button"
                  onClick={() => openEdit('name')}
                  className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition"
                  aria-label="ערוך שם"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-sm text-slate-500 line-clamp-1">{email}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {profile?.role === 'admin' && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200">
                    <Shield className="w-3 h-3" /> מנהל
                  </span>
                )}
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  {memberSinceLabel(profile?.gender ?? null, memberSince)}
                  {genderLabel(profile?.gender ?? null) ? ` · ${genderLabel(profile?.gender ?? null)}` : ''}
                  <button
                    type="button"
                    onClick={() => openEdit('gender')}
                    className="p-0.5 rounded text-slate-400 hover:text-emerald-600"
                    aria-label="ערוך מגדר"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="grid grid-cols-3 gap-3"
        >
          {stats.map((s) => (
            <div key={s.label} className="crystal-stat rounded-2xl p-3 text-center">
              <div
                className="w-9 h-9 rounded-xl mx-auto mb-1.5 flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${s.color}22, ${s.color}11)`,
                  border: `1px solid ${s.color}44`,
                }}
              >
                <s.icon className="w-4 h-4" style={{ color: s.color }} strokeWidth={2.4} />
              </div>
              <p className="text-xl font-black text-slate-900 tabular-nums">{s.value}</p>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </motion.div>

        <ProfileRhythmCard
          initial={rhythm}
          onSaved={() => startTransition(() => router.refresh())}
        />

        {summaryRows.length > 0 && (
          <motion.div
            dir="rtl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="crystal-surface rounded-3xl overflow-hidden"
          >
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-600" />
                מה שאלמוג יודע עלייך
              </h3>
              <button
                type="button"
                onClick={() => setIsChatOpen(true)}
                className="text-xs font-bold text-emerald-700 flex items-center gap-1 hover:underline"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                עדכן
              </button>
            </div>
            <div className="crystal-divider mx-5" />
            <div className="px-5 py-3 space-y-1">
              {summaryRows.map((row) => (
                <EditableInfoRow
                  key={row.label}
                  label={row.label}
                  value={row.value}
                  onEdit={
                    row.label === 'שם'
                      ? () => openEdit('name')
                      : row.label === 'מין'
                        ? () => openEdit('gender')
                        : () => setIsChatOpen(true)
                  }
                />
              ))}
            </div>
          </motion.div>
        )}

        {(profile?.height_cm || profile?.activity_level) && (
          <motion.div
            dir="rtl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="crystal-surface rounded-3xl overflow-hidden"
          >
            <div className="px-5 pt-4 pb-2">
              <h3 className="font-bold text-slate-900">מדדים נוספים</h3>
            </div>
            <div className="crystal-divider mx-5" />
            <div className="px-5 py-3 space-y-1">
              {profile?.height_cm ? (
                <EditableInfoRow
                  label="גובה"
                  value={`${profile.height_cm} ס"מ`}
                  onEdit={() => setIsChatOpen(true)}
                />
              ) : null}
              {profile?.activity_level ? (
                <EditableInfoRow
                  label="רמת פעילות"
                  value={activityLabels[profile.activity_level] ?? profile.activity_level}
                  onEdit={() => setIsChatOpen(true)}
                />
              ) : null}
            </div>
          </motion.div>
        )}

        <motion.div
          dir="rtl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }}
          className="crystal-surface rounded-3xl overflow-hidden"
        >
          <div className="px-5 pt-4 pb-2">
            <h3 className="font-bold text-slate-900">ניווט מהיר</h3>
          </div>
          <div className="crystal-divider mx-5" />
          {navItems.map((item, idx, arr) => (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              prefetch
              className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-emerald-50/60"
              style={idx < arr.length - 1 ? { borderBottom: '1px solid rgba(6,78,59,0.06)' } : {}}
            >
              <div className="crystal-pill w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                {item.emoji}
              </div>
              <span className="flex-1 text-sm font-semibold text-slate-700 text-right">{item.label}</span>
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            </Link>
          ))}
          <Link
            href="/settings/almog"
            className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-emerald-50/60 border-t border-emerald-50"
          >
            <div className="crystal-pill w-9 h-9 rounded-xl flex items-center justify-center text-lg">
              🔔
            </div>
            <span className="flex-1 text-sm font-semibold text-slate-700 text-right">התראות מאלמוג</span>
            <Bell className="w-4 h-4 text-slate-400" />
          </Link>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full flex items-center justify-center gap-2 rounded-2xl p-4 font-bold text-red-700 transition-all active:scale-98"
            style={{
              background: 'linear-gradient(135deg, rgba(254,226,226,0.95), rgba(254,202,202,0.88))',
              border: '1px solid rgba(248,113,113,0.35)',
            }}
          >
            {isSigningOut ? (
              <div className="w-5 h-5 border-2 border-red-700/30 border-t-red-700 rounded-full animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            התנתקות
          </button>
          {signOutError ? (
            <p className="mt-2 text-center text-sm font-semibold text-red-600">{signOutError}</p>
          ) : null}
        </motion.div>

        <LegalLinksRow tone="light" className="pt-2 pb-1" />
      </div>

      <AnimatedDialog
        open={editField !== null}
        onClose={() => setEditField(null)}
        zIndex={280}
        aria-label="עריכת פרופיל"
        backdropClassName="absolute inset-0 bg-slate-900/45"
        panelClassName="crystal-surface max-w-md overflow-hidden rounded-2xl shadow-2xl"
      >
        <div className="crystal-header flex items-center justify-between px-4 py-3">
          <h3 className="text-lg font-black text-white">
            {editField === 'gender' ? 'עריכת מגדר' : 'עריכת שם'}
          </h3>
          <button
            type="button"
            onClick={() => setEditField(null)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/90 hover:bg-white/15"
            aria-label="סגור"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <div className="space-y-3">
            {(editField === 'name' || editField === 'gender') && editField === 'name' ? (
              <div>
                <label htmlFor="profile-edit-name" className="mb-1 block text-sm font-semibold text-slate-700 text-right">
                  שם מלא
                </label>
                <input
                  id="profile-edit-name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="crystal-pill w-full rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-400/40"
                  placeholder="איך קוראים לך?"
                  dir="rtl"
                />
              </div>
            ) : null}

            {editField === 'gender' ? (
              <div>
                <label htmlFor="profile-edit-gender" className="mb-1 block text-sm font-semibold text-slate-700 text-right">
                  מגדר
                </label>
                <select
                  id="profile-edit-gender"
                  value={genderInput}
                  onChange={(e) => setGenderInput((e.target.value as 'male' | 'female' | '') ?? '')}
                  className="crystal-pill w-full rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-400/40"
                >
                  <option value="">ללא בחירה</option>
                  <option value="male">זכר</option>
                  <option value="female">נקבה</option>
                </select>
              </div>
            ) : null}
          </div>

          {saveError ? <p className="mt-3 text-sm font-semibold text-red-600">{saveError}</p> : null}

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
      </AnimatedDialog>
    </div>
  );
}

function EditableInfoRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-2 group">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm text-slate-500 shrink-0">{label}</span>
        <button
          type="button"
          onClick={onEdit}
          className="p-1 rounded-md text-slate-300 opacity-60 group-hover:opacity-100 group-hover:text-emerald-600 transition"
          aria-label={`ערוך ${label}`}
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
      <span className="text-sm font-semibold text-slate-800 text-left line-clamp-1">{value}</span>
    </div>
  );
}
