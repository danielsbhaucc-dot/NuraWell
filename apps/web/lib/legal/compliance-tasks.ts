/** Autonomous legal & compliance task list (Ops → אבטחה ופרטיות). Pure helpers, shared by API, UI and tests. */

export const STATUSES = ['open', 'in_progress', 'done', 'not_relevant'] as const;
export const RECURRENCES = ['one_time', 'monthly', 'quarterly', 'yearly'] as const;
export const OWNERS = ['daniel', 'automatic'] as const;
export const REQUIREMENTS = ['required', 'recommended'] as const;
export type TaskStatus = (typeof STATUSES)[number];
export type Recurrence = (typeof RECURRENCES)[number];
export type TaskOwner = (typeof OWNERS)[number];

export type ComplianceTask = {
  id: string;
  slug: string;
  title: string;
  explanation: string;
  legal_why: string;
  requirement: (typeof REQUIREMENTS)[number];
  cost_estimate: string | null;
  status: TaskStatus;
  recurrence: Recurrence;
  next_due: string | null;
  last_done: string | null;
  owner: TaskOwner;
  evidence: string | null;
  sort_order: number;
  updated_at: string;
};

export const STATUS_HE: Record<TaskStatus, string> = { open: 'פתוח', in_progress: 'בטיפול', done: 'בוצע', not_relevant: 'לא רלוונטי' };
export const RECURRENCE_HE: Record<Recurrence, string> = { one_time: 'חד־פעמי', monthly: 'כל חודש', quarterly: 'כל רבעון', yearly: 'כל שנה' };
export const OWNER_HE: Record<TaskOwner, string> = { daniel: 'דניאל', automatic: 'אוטומטי' };

const MONTHS: Record<Recurrence, number> = { one_time: 0, monthly: 1, quarterly: 3, yearly: 12 };

/** YYYY-MM-DD in Asia/Jerusalem. */
export function todayIL(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Add whole months to a YYYY-MM-DD date, clamping to the month's last day (Jan 31 + 1m → Feb 28/29). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Next due date after completing on `doneOn`. One-time tasks have none. */
export function nextDueAfter(recurrence: Recurrence, doneOn: string): string | null {
  const n = MONTHS[recurrence];
  return n ? addMonths(doneOn, n) : null;
}

/** State after marking a task done today. Recurring tasks roll forward and stay "done" until due again. */
export function completeTask(t: Pick<ComplianceTask, 'recurrence'>, doneOn: string) {
  return { status: 'done' as const, last_done: doneOn, next_due: nextDueAfter(t.recurrence, doneOn) };
}

export type DueState = 'overdue' | 'due_soon' | 'scheduled' | 'done' | 'not_relevant';

/** Is the task actionable? Recurring tasks come back once their next_due arrives, even after "done". */
export function dueState(t: Pick<ComplianceTask, 'status' | 'recurrence' | 'next_due'>, today: string, withinDays = 14): DueState {
  if (t.status === 'not_relevant') return 'not_relevant';
  const recurringDone = t.status === 'done' && t.recurrence !== 'one_time';
  if (t.status === 'done' && !recurringDone) return 'done';
  if (!t.next_due) return recurringDone ? 'done' : 'scheduled';
  const days = daysBetween(today, t.next_due);
  if (days < 0) return 'overdue';
  if (days <= withinDays) return 'due_soon';
  return recurringDone ? 'done' : 'scheduled';
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function dueTasks<T extends Pick<ComplianceTask, 'status' | 'recurrence' | 'next_due'>>(tasks: T[], today: string, withinDays = 14) {
  return tasks
    .map((t) => ({ ...t, due_state: dueState(t, today, withinDays) }))
    .filter((t) => t.due_state === 'overdue' || t.due_state === 'due_soon')
    .sort((a, b) => (a.next_due ?? '').localeCompare(b.next_due ?? ''));
}

export type TaskPatch = Partial<Pick<ComplianceTask, 'status' | 'evidence' | 'next_due'>> & { complete?: boolean };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a PATCH body from the admin UI. Only status, evidence, next_due and "complete" may change. */
export function parsePatch(body: unknown): { ok: true; patch: TaskPatch } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad_body' };
  const b = body as Record<string, unknown>;
  const patch: TaskPatch = {};
  if (b.complete !== undefined) {
    if (b.complete !== true) return { ok: false, error: 'bad_complete' };
    patch.complete = true;
  }
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status as TaskStatus)) return { ok: false, error: 'bad_status' };
    patch.status = b.status as TaskStatus;
  }
  if (b.evidence !== undefined) {
    if (b.evidence !== null && (typeof b.evidence !== 'string' || b.evidence.length > 2000)) return { ok: false, error: 'bad_evidence' };
    patch.evidence = typeof b.evidence === 'string' ? b.evidence.trim() || null : null;
  }
  if (b.next_due !== undefined) {
    if (b.next_due !== null && (typeof b.next_due !== 'string' || !DATE_RE.test(b.next_due) || Number.isNaN(Date.parse(b.next_due)))) return { ok: false, error: 'bad_next_due' };
    patch.next_due = b.next_due as string | null;
  }
  if (!Object.keys(patch).length) return { ok: false, error: 'empty' };
  return { ok: true, patch };
}

/** Turn a validated patch into the DB update for a given task. */
export function buildUpdate(t: Pick<ComplianceTask, 'recurrence'>, patch: TaskPatch, today: string, actorId: string) {
  const u: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: actorId };
  if (patch.status) u.status = patch.status;
  if (patch.evidence !== undefined) u.evidence = patch.evidence;
  if (patch.next_due !== undefined) u.next_due = patch.next_due;
  if (patch.complete || patch.status === 'done') Object.assign(u, completeTask(t, today));
  return u;
}
