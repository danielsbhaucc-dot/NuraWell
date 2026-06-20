import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

type AiChatPrivacyNoticeProps = {
  /** עיצוב כהה (צ'אט אלמוג) או בהיר (מגירות onboarding). */
  variant?: 'dark' | 'light';
  className?: string;
};

/**
 * הודעת היידוע לפני שליחת הודעה ל-AI — אל תמסור פרטים מזהים; ספקים בינלאומיים.
 */
export function AiChatPrivacyNotice({ variant = 'dark', className = '' }: AiChatPrivacyNoticeProps) {
  const isDark = variant === 'dark';

  return (
    <p
      role="note"
      className={[
        'flex items-start gap-1.5 text-[11px] leading-snug',
        isDark ? 'text-amber-100/85' : 'text-amber-900/90',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <ShieldAlert
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isDark ? 'text-amber-300/90' : 'text-amber-700'}`}
        aria-hidden
      />
      <span>
        <strong className={isDark ? 'text-amber-50/95' : 'text-amber-950'}>לפני שליחה:</strong>{' '}
        אל תמסור/י פרטים מזהים (מספר זהות, כתובת, טלפון, אימייל). עיבוד השיחה מתבצע דרך ספקי AI
        בינלאומיים (ארה&quot;ב וסין) תחת הגנות פרטיות.{' '}
        <Link
          href="/privacy"
          className={`underline underline-offset-2 ${isDark ? 'text-emerald-200/90' : 'text-emerald-800'}`}
        >
          פרטים
        </Link>
      </span>
    </p>
  );
}
