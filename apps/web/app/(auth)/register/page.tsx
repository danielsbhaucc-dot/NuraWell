'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Eye, EyeOff, UserPlus } from 'lucide-react';
import { createClient } from '../../../lib/supabase/client';
import { NuraWellLogo } from '../../../components/shared/NuraWellLogo';
import { useToast, ToastContainer } from '../../../components/shared/Toast';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) {
      toast.error('אימייל לא תקין', 'יש להזין כתובת אימייל עם @');
      return;
    }
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });

      if (authError) {
        toast.error(
          'הרשמה נכשלה',
          authError.message === 'User already registered'
            ? 'כתובת האימייל כבר רשומה במערכת'
            : 'שגיאה בהרשמה, נסו שוב'
        );
        return;
      }

      if (authData.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('profiles') as any).insert({
          id: authData.user.id,
          full_name: fullName,
          role: 'user',
        });

        toast.success('ברוכים הבאים!', 'החשבון נוצר בהצלחה — מעבירים אותך...');
        setTimeout(() => {
          router.push('/courses');
          router.refresh();
        }, 1200);
      }
    } catch {
      toast.error('שגיאה', 'משהו השתבש, נסו שוב');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
      <main
        className="min-h-screen flex flex-col justify-center px-4 py-10 bg-mesh"
      >

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="max-w-md mx-auto w-full relative z-10"
        >
          {/* ── Header ── */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-5">
              <NuraWellLogo size="lg" showTagline />
            </div>
            <div className="mt-5 mb-2">
              <h1 className="text-3xl font-black leading-tight text-gray-900" style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}>
                הרשמה חינמית
              </h1>
            </div>
            <p className="text-gray-500 text-[15px] mt-1.5 font-medium">התחילו את המסע לחיים בריאים יותר</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <div className="h-px flex-1 max-w-[50px]" style={{ background: 'linear-gradient(to left, rgba(16,185,129,0.3), transparent)' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <div className="h-px flex-1 max-w-[50px]" style={{ background: 'linear-gradient(to right, rgba(16,185,129,0.3), transparent)' }} />
            </div>
          </div>

          {/* ── Form Card ── */}
          <div className="rounded-3xl p-8 bg-white" style={{
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1.5 h-7 rounded-full" style={{ background: 'linear-gradient(to bottom, #34d399, #047857)' }} />
              <UserPlus className="w-5 h-5 text-emerald-600" />
              <h2 className="text-gray-900 font-black text-xl" style={{ fontFamily: 'Rubik, Heebo, sans-serif' }}>יצירת חשבון</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700 mb-2">
                  <User className="w-4 h-4 text-emerald-600" />
                  שם מלא
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="input-field text-sm"
                  placeholder="ישראל ישראלי"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700 mb-2">
                  <Mail className="w-4 h-4 text-emerald-600" />
                  כתובת אימייל
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  dir="ltr"
                  className="input-field text-sm"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-sm font-bold text-gray-700 mb-2">
                  <Lock className="w-4 h-4 text-emerald-600" />
                  סיסמה
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    dir="ltr"
                    className="input-field text-sm pl-12"
                    placeholder="לפחות 6 תווים"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <div className="h-px w-full mb-4" style={{ background: 'linear-gradient(to right, transparent, rgba(0,0,0,0.06), transparent)' }} />
                <button type="submit" disabled={isLoading}
                  className="w-full py-4 rounded-2xl font-bold text-lg text-white transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #047857, #10b981)', boxShadow: '0 8px 24px rgba(16,185,129,0.4)' }}>
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="w-5 h-5" />
                      יצירת חשבון חינמי
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="mt-5 text-center">
              <p className="text-gray-500 text-sm">
                כבר יש לכם חשבון?{' '}
                <Link href="/login" className="text-emerald-600 font-bold hover:text-emerald-700 transition-colors">
                  כניסה לחשבון
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </main>
    </>
  );
}
