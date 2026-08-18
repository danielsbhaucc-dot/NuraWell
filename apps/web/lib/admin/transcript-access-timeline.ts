export type TranscriptAccessRequestRow = {
  id: string;
  session_id: string | null;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  reason: string;
  created_at: string;
  expires_at: string;
  resolved_at: string | null;
  access_until: string | null;
  notification_sent_at: string | null;
  user_viewed_at: string | null;
  user_response_note: string | null;
};

export type TimelineStepStatus = 'done' | 'active' | 'pending' | 'failed' | 'skipped';

export type TranscriptAccessTimelineStep = {
  key: string;
  label: string;
  status: TimelineStepStatus;
  at: string | null;
  detail: string | null;
};

export type TranscriptAccessInsight = {
  tone: 'success' | 'info' | 'warning' | 'neutral';
  text: string;
};

function hoursBetween(from: string, toMs: number): number {
  return Math.max(0, (toMs - new Date(from).getTime()) / 3_600_000);
}

function hoursUntil(iso: string, nowMs: number): number {
  return Math.max(0, (new Date(iso).getTime() - nowMs) / 3_600_000);
}

export function buildTranscriptAccessTimeline(
  request: TranscriptAccessRequestRow | null,
  nowMs = Date.now(),
): TranscriptAccessTimelineStep[] {
  if (!request) return [];

  const isExpired =
    request.status === 'expired' ||
    (request.status === 'pending' && new Date(request.expires_at).getTime() <= nowMs);

  const steps: TranscriptAccessTimelineStep[] = [
    {
      key: 'created',
      label: 'בקשה נשלחה',
      status: 'done',
      at: request.created_at,
      detail: request.reason,
    },
    {
      key: 'notification',
      label: 'התראה נשלחה למשתמש',
      status: request.notification_sent_at
        ? 'done'
        : request.status === 'pending' && !isExpired
          ? 'active'
          : 'pending',
      at: request.notification_sent_at,
      detail: request.notification_sent_at ? 'in-app + push' : null,
    },
    {
      key: 'viewed',
      label: 'משתמש צפה בבקשה',
      status: request.user_viewed_at
        ? 'done'
        : request.status === 'pending' && !isExpired
          ? 'pending'
          : request.status === 'pending'
            ? 'skipped'
            : 'pending',
      at: request.user_viewed_at,
      detail: null,
    },
  ];

  if (request.status === 'approved') {
    steps.push({
      key: 'approved',
      label: 'משתמש אישר',
      status: 'done',
      at: request.resolved_at,
      detail: request.access_until
        ? `גישה עד ${new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(request.access_until))}`
        : 'גישה ל-24 שעות',
    });
  } else if (request.status === 'denied') {
    steps.push({
      key: 'denied',
      label: 'משתמש דחה',
      status: 'failed',
      at: request.resolved_at,
      detail: request.user_response_note?.trim() || 'ללא הסבר',
    });
  } else if (isExpired) {
    steps.push({
      key: 'expired',
      label: 'הבקשה פגה',
      status: 'failed',
      at: request.expires_at,
      detail: 'לא התקבלה תשובה בזמן',
    });
  } else {
    steps.push({
      key: 'waiting',
      label: 'ממתין לתשובת משתמש',
      status: 'active',
      at: null,
      detail: `בתוקף עד ${new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(request.expires_at))}`,
    });
  }

  return steps;
}

export function buildTranscriptAccessInsight(
  request: TranscriptAccessRequestRow | null,
  nowMs = Date.now(),
): TranscriptAccessInsight | null {
  if (!request) return null;

  if (request.status === 'approved') {
    return {
      tone: 'success',
      text: 'הגישה אושרה — ניתן לצפות בתמליל לאחר הזנת סיבת גישה.',
    };
  }

  if (request.status === 'denied') {
    const note = request.user_response_note?.trim();
    return {
      tone: 'warning',
      text: note
        ? `המשתמש דחה את הבקשה: «${note}». ניתן לשלוח בקשה חדשה עם נימוק מעודכן.`
        : 'המשתמש דחה את הבקשה. ניתן לשלוח בקשה חדשה עם נימוק מעודכן.',
    };
  }

  const expired =
    request.status === 'expired' ||
    (request.status === 'pending' && new Date(request.expires_at).getTime() <= nowMs);

  if (expired) {
    return {
      tone: 'warning',
      text: 'הבקשה פגה ללא מענה. שלח/י בקשה חדשה אם עדיין נדרשת גישה.',
    };
  }

  const hoursLeft = hoursUntil(request.expires_at, nowMs);
  const hoursSinceCreated = hoursBetween(request.created_at, nowMs);

  if (request.user_viewed_at) {
    const hoursSinceView = hoursBetween(request.user_viewed_at, nowMs);
    if (hoursSinceView >= 6) {
      return {
        tone: 'info',
        text: `המשתמש צפה בבקשה לפני ${Math.round(hoursSinceView)} שעות — ייתכן שממתין/ה להחליט. נותרו ~${Math.round(hoursLeft)} שעות לתוקף.`,
      };
    }
    return {
      tone: 'info',
      text: `המשתמש צפה בבקשה לאחרונה — סביר שתתקבל תשובה בקרוב. נותרו ~${Math.round(hoursLeft)} שעות לתוקף.`,
    };
  }

  if (request.notification_sent_at && hoursSinceCreated >= 4) {
    return {
      tone: 'warning',
      text: `המשתמש טרם פתח את הבקשה (${Math.round(hoursSinceCreated)} שעות). שקול/י ליצור קשר ישיר או לשלוח בקשה חדשה.`,
    };
  }

  if (hoursLeft <= 12) {
    return {
      tone: 'warning',
      text: `הבקשה תפוג בעוד ~${Math.round(hoursLeft)} שעות — מומלץ לוודא שהמשתמש קיבל את ההתראה.`,
    };
  }

  return {
    tone: 'neutral',
    text: 'הבקשה בטיפול. הסטטוס מתעדכן אוטומטית כשהמשתמש יצפה או יגיב.',
  };
}

export function pickLatestRequestPerSession<T extends { session_id: string | null; created_at: string }>(
  rows: T[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (!row.session_id) continue;
    const existing = map.get(row.session_id);
    if (!existing || row.created_at > existing.created_at) {
      map.set(row.session_id, row);
    }
  }
  return map;
}
