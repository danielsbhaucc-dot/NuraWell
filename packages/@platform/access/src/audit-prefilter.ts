/**
 * Nightly access audit: deterministic pre-filter + pseudonymisation. Only flagged, pseudonymous rows ever
 * reach a model (no names, emails, IPs, user ids, free-text content). Idle days cost nothing.
 */
export type AccessEvent = {
  at: number; actorId: string; kind: 'pii_view' | 'pii_grant' | 'login' | 'device_enrolled' | 'device_revoked' | 'probe';
  subjectId?: string | null; reason?: string | null; ticketRef?: string | null;
  ipHash?: string | null; country?: string | null; deviceId?: string | null; count?: number;
};
export type Signal = 'odd_hours' | 'vague_reason' | 'no_ticket' | 'many_subjects' | 'new_country' | 'new_device' | 'probe_burst';
export type Flagged = { ref: string; kind: AccessEvent['kind']; hourLocal: number; signals: Signal[]; reasonLen: number; reasonWords: number; subjectsByActor: number };

export const MANY_SUBJECTS = 10;
export const PROBE_BURST = 200;

export function localHour(at: number, tz = 'Asia/Jerusalem'): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(new Date(at))) % 24;
}

export function prefilter(events: AccessEvent[], known: { countries: Set<string>; devices: Set<string> }, tz = 'Asia/Jerusalem'): Flagged[] {
  const subjects = new Map<string, Set<string>>();
  for (const e of events) if (e.kind === 'pii_view' && e.subjectId) {
    if (!subjects.has(e.actorId)) subjects.set(e.actorId, new Set());
    subjects.get(e.actorId)!.add(e.subjectId);
  }
  const out: Flagged[] = [];
  events.forEach((e, i) => {
    const s: Signal[] = [];
    const h = localHour(e.at, tz);
    const many = subjects.get(e.actorId)?.size ?? 0;
    if (e.kind !== 'probe' && (h < 6 || h >= 23)) s.push('odd_hours');
    if (e.kind === 'pii_grant') {
      const r = (e.reason ?? '').trim();
      if (r.split(/\s+/).filter(Boolean).length < 4) s.push('vague_reason');
      if (!e.ticketRef) s.push('no_ticket');
    }
    if (e.kind === 'pii_view' && many >= MANY_SUBJECTS) s.push('many_subjects');
    if (e.country && !known.countries.has(e.country)) s.push('new_country');
    if (e.deviceId && !known.devices.has(e.deviceId) && e.kind !== 'device_enrolled') s.push('new_device');
    if (e.kind === 'probe' && (e.count ?? 0) >= PROBE_BURST) s.push('probe_burst');
    if (s.length) out.push({ ref: `e${i + 1}`, kind: e.kind, hourLocal: h, signals: s, reasonLen: (e.reason ?? '').length, reasonWords: (e.reason ?? '').trim().split(/\s+/).filter(Boolean).length, subjectsByActor: many });
  });
  return out;
}

/** Payload for the model: refs + numeric/enum features only. Throws if anything that looks identifying slipped in. */
export function toModelPayload(rows: Flagged[]): string {
  const s = JSON.stringify(rows.map((r) => ({ ref: r.ref, kind: r.kind, hour: r.hourLocal, signals: r.signals, reasonLen: r.reasonLen, reasonWords: r.reasonWords, subjectsByActor: r.subjectsByActor })));
  if (/@|[0-9a-f]{8}-[0-9a-f]{4}-|\b\d{1,3}(\.\d{1,3}){3}\b/i.test(s)) throw new Error('identifying data in audit payload');
  return s;
}
