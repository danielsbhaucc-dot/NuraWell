'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

const config = {
  success: {
    icon: CheckCircle2,
    iconBg: 'linear-gradient(135deg, rgba(16,185,129,0.35), rgba(5,150,105,0.25))',
    iconColor: '#34d399',
    titleColor: '#ecfdf5',
    msgColor: '#a7f3d0',
    border: 'rgba(16,185,129,0.45)',
    glow: 'rgba(16,185,129,0.22)',
    bar: 'linear-gradient(90deg, #059669, #10b981, #34d399)',
    cardBg: 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(5,150,105,0.10) 50%, rgba(11,18,32,0.85) 100%)',
    sideBar: 'linear-gradient(to bottom, #10b981, #34d399)',
    outerGlow: '0 0 40px rgba(16,185,129,0.18)',
    label: 'הצלחה',
  },
  error: {
    icon: XCircle,
    iconBg: 'linear-gradient(135deg, rgba(239,68,68,0.35), rgba(185,28,28,0.25))',
    iconColor: '#fca5a5',
    titleColor: '#fff1f2',
    msgColor: '#fecaca',
    border: 'rgba(239,68,68,0.5)',
    glow: 'rgba(239,68,68,0.25)',
    bar: 'linear-gradient(90deg, #b91c1c, #ef4444, #f87171)',
    cardBg: 'linear-gradient(135deg, rgba(239,68,68,0.22) 0%, rgba(185,28,28,0.12) 50%, rgba(11,18,32,0.85) 100%)',
    sideBar: 'linear-gradient(to bottom, #ef4444, #f87171)',
    outerGlow: '0 0 40px rgba(239,68,68,0.22)',
    label: 'שגיאה',
  },
  info: {
    icon: Info,
    iconBg: 'linear-gradient(135deg, rgba(59,130,246,0.35), rgba(29,78,216,0.25))',
    iconColor: '#93c5fd',
    titleColor: '#eff6ff',
    msgColor: '#bfdbfe',
    border: 'rgba(59,130,246,0.45)',
    glow: 'rgba(59,130,246,0.22)',
    bar: 'linear-gradient(90deg, #1d4ed8, #3b82f6, #60a5fa)',
    cardBg: 'linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(29,78,216,0.10) 50%, rgba(11,18,32,0.85) 100%)',
    sideBar: 'linear-gradient(to bottom, #3b82f6, #60a5fa)',
    outerGlow: '0 0 40px rgba(59,130,246,0.18)',
    label: 'מידע',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'linear-gradient(135deg, rgba(234,179,8,0.35), rgba(161,98,7,0.25))',
    iconColor: '#fde047',
    titleColor: '#fefce8',
    msgColor: '#fef08a',
    border: 'rgba(234,179,8,0.45)',
    glow: 'rgba(234,179,8,0.22)',
    bar: 'linear-gradient(90deg, #a16207, #eab308, #fbbf24)',
    cardBg: 'linear-gradient(135deg, rgba(234,179,8,0.18) 0%, rgba(161,98,7,0.10) 50%, rgba(11,18,32,0.85) 100%)',
    sideBar: 'linear-gradient(to bottom, #eab308, #fbbf24)',
    outerGlow: '0 0 40px rgba(234,179,8,0.18)',
    label: 'אזהרה',
  },
};

function Toast({ toast, onDismiss }: ToastProps) {
  const c = config[toast.type];
  const Icon = c.icon;
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; });

  useEffect(() => {
    const t = setTimeout(() => dismissRef.current(toast.id), 4000);
    return () => clearTimeout(t);
  }, [toast.id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -32, scale: 0.9, x: 20 }}
      animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
      exit={{ opacity: 0, y: -16, scale: 0.95, x: 20, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="relative overflow-hidden w-full"
      style={{
        borderRadius: '20px',
        background: c.cardBg,
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        border: `1.5px solid ${c.border}`,
        boxShadow: `0 16px 48px rgba(0,0,0,0.5), ${c.outerGlow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
      }}
    >
      {/* Top gradient strip */}
      <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-[20px]" style={{ background: c.bar }} />

      {/* Right accent bar (RTL layout) */}
      <div className="absolute top-4 bottom-4 right-0 w-[3px] rounded-full" style={{ background: c.sideBar }} />

      {/* Progress bar */}
      <motion.div
        className="absolute bottom-0 right-0 h-[2px] rounded-b-[20px]"
        style={{ background: c.bar, opacity: 0.6 }}
        initial={{ width: '100%' }}
        animate={{ width: '0%' }}
        transition={{ duration: 4.0, ease: 'linear' }}
      />

      <div className="flex items-start gap-3.5 px-4 py-4 pr-5">
        {/* Icon */}
        <div
          className="flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center"
          style={{
            background: c.iconBg,
            boxShadow: `0 4px 16px ${c.glow}, inset 0 1px 0 rgba(255,255,255,0.12)`,
            border: `1px solid ${c.border}`,
          }}
        >
          <Icon className="w-[22px] h-[22px]" style={{ color: c.iconColor }} strokeWidth={2.2} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 text-right pt-0.5">
          <p className="font-black text-[15px] leading-tight tracking-tight" style={{ color: c.titleColor, fontFamily: 'Rubik, Heebo, sans-serif' }}>
            {toast.title}
          </p>
          {toast.message && (
            <p className="text-sm mt-1 leading-relaxed font-medium" style={{ color: c.msgColor, opacity: 0.9 }}>
              {toast.message}
            </p>
          )}
        </div>

        {/* Close */}
        <button
          onClick={() => onDismiss(toast.id)}
          className="flex-shrink-0 w-7 h-7 rounded-xl flex items-center justify-center transition-all mt-0.5"
          style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

// ---- Toast Container ----
interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2.5 w-full px-4 max-w-[380px] pointer-events-none">
      <AnimatePresence mode="sync">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <Toast toast={t} onDismiss={onDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---- Hook ----
export function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const show = (type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, title, message }]);
  };

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return {
    toasts,
    dismiss,
    success: (title: string, message?: string) => show('success', title, message),
    error: (title: string, message?: string) => show('error', title, message),
    info: (title: string, message?: string) => show('info', title, message),
    warning: (title: string, message?: string) => show('warning', title, message),
  };
}
