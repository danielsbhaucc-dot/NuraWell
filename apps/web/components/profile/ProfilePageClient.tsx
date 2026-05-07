'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import {
  User, Mail, Award, BookOpen, Flame, LogOut,
  ChevronLeft, Shield, Settings
} from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import { useRouter } from 'next/navigation';

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

  const stats = [
    { label: 'שיעורים הושלמו', value: totalCompleted, icon: Award,    color: '#10b981' },
    { label: 'קורסים פעילים',  value: enrolledCount,  icon: BookOpen, color: '#14b8a6' },
    { label: 'רצף ימים',       value: profile?.streak_days ?? 0, icon: Flame, color: '#f97316' },
  ];

  return (
    <div className="min-h-screen bg-mesh-subtle">
      <div className="container-mobile py-6 pb-8 space-y-5">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <h1 className="text-2xl font-black text-white mb-1">הפרופיל שלי 👤</h1>
          <p className="text-slate-400 text-sm">נהל את הפרופיל האישי שלך</p>
        </motion.div>

        {/* Avatar + Name Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-5"
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
              <p className="text-lg font-black text-white line-clamp-1">
                {profile?.full_name || 'משתמש NuraWell'}
              </p>
              <p className="text-sm text-slate-400 line-clamp-1">{email}</p>
              <div className="flex items-center gap-2 mt-1.5">
                {profile?.role === 'admin' && (
                  <span className="badge-accent text-xs">
                    <Shield className="w-3 h-3 inline-block ml-0.5" /> מנהל
                  </span>
                )}
                <span className="text-xs text-slate-500">חבר מאז {memberSince}</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="grid grid-cols-3 gap-3"
        >
          {stats.map((s) => (
            <div key={s.label} className="glass-card p-3 text-center">
              <div className="w-8 h-8 rounded-xl mx-auto mb-1.5 flex items-center justify-center"
                style={{ background: `${s.color}22`, border: `1px solid ${s.color}44` }}>
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
              <p className="text-xl font-black text-white">{s.value}</p>
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
            className="glass-card p-5"
          >
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
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
          className="glass-card overflow-hidden"
          style={{ padding: 0 }}
        >
          {[
            { label: 'ההתקדמות שלי', href: '/progress', icon: Award,    emoji: '📊' },
            { label: 'הקורסים שלי',  href: '/courses',  icon: BookOpen, emoji: '📚' },
          ].map((item, idx, arr) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 p-4 hover:bg-white/5 transition-colors"
              style={idx < arr.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.06)' } : {}}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {item.emoji}
              </div>
              <span className="flex-1 text-sm font-semibold text-slate-200">{item.label}</span>
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </a>
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
            className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl font-bold text-red-400 transition-all hover:bg-red-500/10 active:scale-98"
            style={{ border: '1px solid rgba(239,68,68,0.2)' }}
          >
            {isSigningOut ? (
              <div className="w-5 h-5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            התנתקות
          </button>
        </motion.div>

      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}
