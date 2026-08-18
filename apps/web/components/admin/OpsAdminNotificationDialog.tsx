'use client';

import Link from 'next/link';
import { Bell, ExternalLink, X } from 'lucide-react';
import { AnimatedDialog } from '@/components/shared/AnimatedDialog';

export type OpsAdminNotificationPayload = {
  id: string;
  type: string;
  title: string;
  body: string;
  icon_emoji: string;
  action_url: string | null;
  created_at: string;
};

type OpsAdminNotificationDialogProps = {
  open: boolean;
  notification: OpsAdminNotificationPayload | null;
  opsHref: (path: string) => string;
  onDismiss: () => void;
  onOpenPanel: () => void;
};

function fmtTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function OpsAdminNotificationDialog({
  open,
  notification,
  opsHref,
  onDismiss,
  onOpenPanel,
}: OpsAdminNotificationDialogProps) {
  if (!notification) return null;

  const href = notification.action_url?.startsWith('/')
    ? opsHref(notification.action_url)
    : null;

  return (
    <AnimatedDialog
      open={open}
      onClose={onDismiss}
      zIndex={340}
      aria-labelledby="ops-notif-popup-title"
      backdropClassName="absolute inset-0 bg-slate-900/35 backdrop-blur-sm"
      panelClassName="max-w-sm overflow-hidden rounded-3xl border border-white/50 bg-[#FFFBF5]/95 p-0 shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-[#E8D5B5] bg-[#FFF5E6]/90 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-lg">
            {notification.icon_emoji || '🔔'}
          </span>
          <div>
            <p className="text-[11px] font-bold text-emerald-800">התראת מערכת</p>
            <p className="text-[10px] text-stone-500">{fmtTime(notification.created_at)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="סגור"
          className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3 px-4 py-4 text-right" dir="rtl">
        <h3 id="ops-notif-popup-title" className="text-base font-black text-stone-900">
          {notification.title}
        </h3>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">{notification.body}</p>

        <div className="flex flex-col gap-2 pt-1">
          {href ? (
            <Link
              href={href}
              onClick={onDismiss}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-500 px-4 py-2.5 text-sm font-black text-white shadow-md"
            >
              <ExternalLink className="h-4 w-4" />
              פתח בפאנל
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => {
              onDismiss();
              onOpenPanel();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E8D5B5] bg-white px-4 py-2.5 text-sm font-bold text-stone-700"
          >
            <Bell className="h-4 w-4" />
            כל ההתראות
          </button>
        </div>
      </div>
    </AnimatedDialog>
  );
}
