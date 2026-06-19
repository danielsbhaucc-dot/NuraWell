/**
 * הקשר ההתחייבויות לצ'אט אלמוג — שליפה דחוסה ובלוקי prompt קטנים.
 *
 * מטרה: לתת לאלמוג מודעות מדויקת למה שהוא כבר נתן/הקפיא/מזהה — בלי להציף אותו.
 * הבלוקים קטנים בכוונה, ונטענים מותנה דרך הנתב (חוץ מבאנר פוקוס שתמיד מוזרק).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlmogCommitmentContext } from './types';
import { frictionCategoryLabel } from './friction';
import {
  fetchUserRecoveryState,
  formatRecoveryStateForChat,
} from './recovery-state';
import {
  detectJourneyStruggles,
  formatStruggleSignalsForChat,
} from './struggle-detection';
import type { StruggleSignal } from './struggle-detection';
import {
  detectUnansweredRecoverySignals,
  formatUnansweredRecoveryForChat,
} from './recovery-response-detection';

type Supa = SupabaseClient;

export async function fetchAlmogCommitmentContext(
  supabase: Supa,
  userId: string,
  opts: { needsAssignments: boolean; needsBlockers: boolean }
): Promise<AlmogCommitmentContext> {
  const ctx: AlmogCommitmentContext = {
    activeAssignments: [],
    openBlockers: [],
    recentInterventions: [],
    nextReminders: [],
    activeFocus: null,
    recoveryState: null,
    unansweredRecovery: [],
    activeStruggles: [],
  };

  const tasks: PromiseLike<unknown>[] = [];

  // באנר פוקוס תמיד נטען (זול, אינדקס ייעודי) כדי שאלמוג יישאר מודע.
  tasks.push(
    supabase
      .from('almog_focus_periods')
      .select('id, status, reason, paused_scope, ends_at, assignment_ids')
      .eq('user_id', userId)
      .in('status', ['proposed', 'active'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }: { data: unknown }) => {
        if (data) ctx.activeFocus = data as AlmogCommitmentContext['activeFocus'];
      })
  );

  // מצב recovery — תמיד נטען כדי שאלמוג יידע על משימה מוקפאת + צעד מקל.
  tasks.push(
    fetchUserRecoveryState(supabase, userId)
      .then(async (state) => {
        ctx.recoveryState = state.hasActiveRecovery ? state : null;
        const activeRecovery = new Set(state.tracks.map((t) => t.journeyTaskId));
        const signals = await detectUnansweredRecoverySignals(supabase, userId, undefined, {
          activeRecoveryTaskIds: activeRecovery,
        });
        ctx.unansweredRecovery = signals.filter((s) => s.severity !== 'awareness');
      })
      .catch(() => null)
  );

  tasks.push(
    loadActiveStrugglesForChat(supabase, userId)
      .then((signals) => {
        ctx.activeStruggles = signals;
      })
      .catch(() => null)
  );

  const loadAssignments = opts.needsAssignments;
  const loadBlockers = opts.needsBlockers;

  if (loadAssignments) {
    tasks.push(
      supabase
        .from('almog_assignments')
        .select('id, title, reason, schedule, status, given_at, last_done_at, related_habit_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('given_at', { ascending: false })
        .limit(6)
        .then(({ data }: { data: unknown }) => {
          if (Array.isArray(data))
            ctx.activeAssignments = data as AlmogCommitmentContext['activeAssignments'];
        })
    );
    tasks.push(
      supabase
        .from('scheduled_reminders')
        .select('id, kind, title, body, fire_at')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('fire_at', { ascending: true })
        .limit(3)
        .then(({ data }: { data: unknown }) => {
          if (Array.isArray(data)) ctx.nextReminders = data as AlmogCommitmentContext['nextReminders'];
        })
    );
  }

  if (loadBlockers) {
    tasks.push(
      supabase
        .from('almog_blockers')
        .select('id, description, strategy, category, status, history')
        .eq('user_id', userId)
        .in('status', ['open', 'improving'])
        .order('identified_at', { ascending: false })
        .limit(4)
        .then(({ data }: { data: unknown }) => {
          if (Array.isArray(data)) ctx.openBlockers = data as AlmogCommitmentContext['openBlockers'];
        })
    );
    tasks.push(
      supabase
        .from('almog_interventions')
        .select('barrier_type, strategy, strategy_type, outcome')
        .eq('user_id', userId)
        .in('outcome', ['helped', 'not_helped', 'resolved'])
        .order('created_at', { ascending: false })
        .limit(4)
        .then(({ data }: { data: unknown }) => {
          if (Array.isArray(data))
            ctx.recentInterventions = data as AlmogCommitmentContext['recentInterventions'];
        })
    );
  }

  await Promise.all(tasks.map((p) => Promise.resolve(p).catch(() => null)));

  const needsRecoveryExtras =
    ctx.recoveryState?.hasActiveRecovery ||
    ctx.unansweredRecovery.length > 0 ||
    ctx.activeStruggles.length > 0;

  if (needsRecoveryExtras) {
    const extra: PromiseLike<unknown>[] = [];
    if (!loadAssignments) {
      extra.push(
        supabase
          .from('almog_assignments')
          .select('id, title, reason, schedule, status, given_at, last_done_at, related_habit_id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('given_at', { ascending: false })
          .limit(6)
          .then(({ data }: { data: unknown }) => {
            if (Array.isArray(data))
              ctx.activeAssignments = data as AlmogCommitmentContext['activeAssignments'];
          })
      );
    }
    if (!loadBlockers) {
      extra.push(
        supabase
          .from('almog_blockers')
          .select('id, description, strategy, category, status, history')
          .eq('user_id', userId)
          .in('status', ['open', 'improving'])
          .order('identified_at', { ascending: false })
          .limit(4)
          .then(({ data }: { data: unknown }) => {
            if (Array.isArray(data)) ctx.openBlockers = data as AlmogCommitmentContext['openBlockers'];
          })
      );
    }
    await Promise.all(extra.map((p) => Promise.resolve(p).catch(() => null)));
  }

  return ctx;
}

async function loadActiveStrugglesForChat(
  supabase: Supa,
  userId: string
): Promise<StruggleSignal[]> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [progressRes, execRes, recoveryState] = await Promise.all([
    supabase
      .from('journey_progress')
      .select(
        'user_id, step_id, updated_at, is_completed, task_statuses, task_level_meta, habits_progress, journey_steps ( title, habits, tasks, journey_stations ( title ) )'
      )
      .eq('user_id', userId)
      .eq('is_completed', false)
      .limit(8),
    supabase
      .from('journey_task_executions')
      .select('task_id, date_key, slot, outcome, step_id')
      .eq('user_id', userId)
      .gte('completed_at', since)
      .limit(500),
    fetchUserRecoveryState(supabase, userId),
  ]);

  const rows = (progressRes.data ?? []) as unknown as import('../../workflows/habit-checkpoint-batch').ProgressRow[];
  if (!rows.length) return [];

  const executions = Array.isArray(execRes.data) ? execRes.data : [];
  const activeRecovery = new Set(recoveryState.tracks.map((t) => t.journeyTaskId));

  return detectJourneyStruggles({
    userId,
    progressRows: rows,
    executions,
    activeRecoveryTaskIds: activeRecovery,
  });
}

function israelDayLabel(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(t));
}

const SCHEDULE_LABEL: Record<string, string> = {
  one_time: 'חד-פעמי',
  daily: 'יומי',
  weekly: 'שבועי',
};

/**
 * בונה את בלוקי ה-prompt (מערך — כל איבר נכנס ל-contextSections בנפרד).
 * החזרה ריקה אם אין מה להזריק.
 */
export function formatAlmogCommitmentBlocks(ctx: AlmogCommitmentContext): string[] {
  const blocks: string[] = [];

  // ── חוסר תגובה לשאילתות / צעדים מותאמים ──
  const noReplyBlock = formatUnansweredRecoveryForChat(ctx.unansweredRecovery);
  if (noReplyBlock) blocks.push(noReplyBlock);

  const struggleBlock = formatStruggleSignalsForChat(ctx.activeStruggles);
  if (struggleBlock) blocks.push(struggleBlock);

  // ── תוכנית recovery (משימה מקורית מוקפאת + צעד מותאם) ──
  if (ctx.recoveryState?.hasActiveRecovery) {
    const block = formatRecoveryStateForChat(ctx.recoveryState);
    if (block) blocks.push(block);
  }

  // ── באנר פוקוס (תמיד אם קיים) ──
  if (ctx.activeFocus) {
    const f = ctx.activeFocus;
    const until = israelDayLabel(f.ends_at);
    if (f.status === 'active') {
      blocks.push(
        `[מצב פוקוס פעיל] שמתם בצד את שאר המשימות הרגילות${until ? ` עד ${until}` : ''} כדי להתמקד${
          f.reason ? ` ב: ${f.reason}` : ''
        }. אל תלחץ על ההרגלים הרגילים עכשיו. אם המשתמש חזר לעצמו — הצע לסיים את הפוקוס ולחזור לשגרה.`
      );
    } else {
      blocks.push(
        `[הצעת פוקוס ממתינה] הצעת לשים בצד משימות רגילות${
          f.reason ? ` כדי להתמקד ב: ${f.reason}` : ''
        }. אם המשתמש מאשר — המערכת תפעיל את הפוקוס.`
      );
    }
  }

  // ── משימות אישיות ──
  if (ctx.activeAssignments.length > 0) {
    const lines = ctx.activeAssignments.slice(0, 6).map((a) => {
      const when = israelDayLabel(a.given_at);
      const sched = SCHEDULE_LABEL[a.schedule] ?? '';
      const reason = a.reason ? ` (למה: ${a.reason})` : '';
      const last = a.last_done_at ? ` · בוצע לאחרונה ${israelDayLabel(a.last_done_at)}` : '';
      return `- ${a.title}${reason} [${sched}${when ? `, ניתנה ${when}` : ''}]${last}`;
    });
    blocks.push(
      `[משימות אישיות שנתת למשתמש]\n${lines.join('\n')}\n` +
        `אלה משימות שאתה נתת. אם המשתמש מדווח עליהן — התייחס בהתאם. אל תמציא משימות חדשות שלא נתת בפועל.`
    );
  }

  // ── תזכורת קרובה ──
  if (ctx.nextReminders.length > 0) {
    const r = ctx.nextReminders[0];
    blocks.push(
      `[תזכורת מתוזמנת קרובה] ${r.title}: ${r.body} (${israelDayLabel(r.fire_at) ?? 'בקרוב'}). אל תבטיח שוב; אם המשתמש שואל, אמור שהיא כבר רשומה.`
    );
  }

  // ── חסמים במעקב ──
  if (ctx.openBlockers.length > 0) {
    const lines = ctx.openBlockers.slice(0, 4).map((b) => {
      const cat = b.category ? frictionCategoryLabel(b.category) : '';
      const strat = b.strategy ? ` — דרך להתגבר: ${b.strategy}` : '';
      const hist = Array.isArray(b.history) ? b.history : [];
      const lastNote = [...hist].reverse().find((h) => h && typeof h.note === 'string' && h.note.trim());
      const note = lastNote?.note ? ` · לאחרונה: ${lastNote.note}` : '';
      const catPart = cat ? ` [${cat}]` : '';
      return `- ${b.description}${catPart}${strat} (סטטוס: ${b.status})${note}`;
    });

    const memLines =
      ctx.recentInterventions.length > 0
        ? ctx.recentInterventions
            .slice(0, 3)
            .map((m) => {
              const out =
                m.outcome === 'helped' || m.outcome === 'resolved' ? 'עזר' : 'לא עזר';
              return `  · ${m.barrier_type}: "${m.strategy}" → ${out}`;
            })
            .join('\n')
        : '';

    blocks.push(
      `[חסמים שזיהית ובמעקב]\n${lines.join('\n')}` +
        (memLines ? `\n[מה עבד/לא עבד בעבר]\n${memLines}` : '') +
        `\n[הנחיית friction — קומפקטית]
סווג חסם, הצע 2 אופציות A/B קטנות, ואם "לא עזר" עבור לסוג אסטרטגיה אחר. לא טיפולי; מדע שינוי התנהגות + אמפתיה.`
    );
  }

  return blocks;
}
