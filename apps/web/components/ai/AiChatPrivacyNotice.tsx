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
        isDark ? 'text-accent-100/85' : 'text-accent-900/90',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <ShieldAlert
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isDark ? 'text-accent-300/90' : 'text-accent-700'}`}
        aria-hidden
      />
      <span>
        <strong className={isDark ? 'text-accent-50/95' : 'text-accent-950'}>לפני שליחה:</strong>{' '}
        אין למסור פרטים מזהים (מספר זהות, כתובת, טלפון, אימייל). עיבוד השיחה מתבצע דרך ספקי AI
        בינלאומיים (בעיקר ארה&quot;ב והאיחוד האירופי) תחת הגנות פרטיות.{' '}
        <Link
          href="/privacy"
          className={`underline underline-offset-2 ${isDark ? 'text-primary-200/90' : 'text-primary-800'}`}
        >
          פרטים
        </Link>
      </span>
    </p>
  );
}
