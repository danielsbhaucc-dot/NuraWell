'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Loader2 } from 'lucide-react';

type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  created_at: string;
};

export function AdminChallengeAuditPanel() {
  const [entries, setEntries] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/challenge/audit?limit=30', { credentials: 'include' });
      const data = await res.json();
      setEntries(data.entries ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-7 w-7 animate-spin text-iris-500" />
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-hairline/60 bg-background-card/70 p-5 shadow-xs backdrop-blur-md sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-ink-soft" />
        <h2 className="text-lg font-bold text-ink">יומן שינויים (Audit)</h2>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-ink-faint">אין רשומות עדיין — שינויים ב-OPS יופיעו כאן.</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
          {entries.map((e) => (
            <li key={e.id} className="rounded-xl border border-hairline/60 bg-surface-sunken/80 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-ink">{e.summary}</span>
                <time className="shrink-0 text-[10px] text-ink-faint tabular-nums">
                  {new Date(e.created_at).toLocaleString('he-IL')}
                </time>
              </div>
              <p className="mt-0.5 text-xs text-ink-faint">
                {e.action} · {e.entity_type}
                {e.entity_id ? ` · ${e.entity_id.slice(0, 8)}…` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
