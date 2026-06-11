/**
 * הקשר ההתחייבויות לצ'אט אלמוג — שליפה דחוסה ובלוקי prompt קטנים.
 *
 * מטרה: לתת לאלמוג מודעות מדויקת למה שהוא כבר נתן/הקפיא/מזהה — בלי להציף אותו.
 * הבלוקים קטנים בכוונה, ונטענים מותנה דרך הנתב (חוץ מבאנר פוקוס שתמיד מוזרק).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlmogCommitmentContext } from './types';

type Supa = SupabaseClient;

export async function fetchAlmogCommitmentContext(
  supabase: Supa,
  userId: string,
  opts: { needsAssignments: boolean; needsBlockers: boolean }
): Promise<AlmogCommitmentContext> {
  const ctx: AlmogCommitmentContext = {
    activeAssignments: [],
    openBlockers: [],
    activeFocus: null,
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

  if (opts.needsAssignments) {
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
  }

  if (opts.needsBlockers) {
    tasks.push(
      supabase
        .from('almog_blockers')
        .select('id, description, strategy, status')
        .eq('user_id', userId)
        .in('status', ['open', 'improving'])
        .order('identified_at', { ascending: false })
        .limit(4)
        .then(({ data }: { data: unknown }) => {
          if (Array.isArray(data)) ctx.openBlockers = data as AlmogCommitmentContext['openBlockers'];
        })
    );
  }

  await Promise.all(tasks.map((p) => Promise.resolve(p).catch(() => null)));
  return ctx;
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

  // ── חסמים במעקב ──
  if (ctx.openBlockers.length > 0) {
    const lines = ctx.openBlockers.slice(0, 4).map((b) => {
      const strat = b.strategy ? ` — דרך להתגבר: ${b.strategy}` : '';
      return `- ${b.description}${strat} (סטטוס: ${b.status})`;
    });
    blocks.push(
      `[חסמים שזיהית ובמעקב]\n${lines.join('\n')}\n` +
        `אם רלוונטי, בדוק בעדינות אם יש התקדמות. אל תחזור על זה בכל הודעה.`
    );
  }

  return blocks;
}
