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
        <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-200/60 bg-white/70 p-5 shadow-sm backdrop-blur-md sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-slate-600" />
        <h2 className="text-lg font-bold text-slate-900">יומן שינויים (Audit)</h2>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">אין רשומות עדיין — שינויים ב-OPS יופיעו כאן.</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
          {entries.map((e) => (
            <li key={e.id} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-slate-800">{e.summary}</span>
                <time className="shrink-0 text-[10px] text-slate-400 tabular-nums">
                  {new Date(e.created_at).toLocaleString('he-IL')}
                </time>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
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
