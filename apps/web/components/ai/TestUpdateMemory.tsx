'use client';

import { useState } from 'react';

export function TestUpdateMemory() {
  const [loading, setLoading] = useState(false);

  return (
    <div className="relative z-[260] flex items-center gap-2">
      <button
        type="button"
        onClick={async () => {
          if (loading) return;
          setLoading(true);
          try {
            const updateRes = await fetch('/api/v1/ai/memory', { method: 'POST' });
            if (!updateRes.ok) {
              const err = await updateRes.json().catch(() => ({}));
              console.error('[Test Update Memory] update failed', err);
              return;
            }

            const getRes = await fetch('/api/v1/ai/memory', { method: 'GET' });
            const data = await getRes.json();
            console.log('[Test Update Memory] updated memory', data);
          } catch (error) {
            console.error('[Test Update Memory] request failed', error);
          } finally {
            setLoading(false);
          }
        }}
        className="relative z-[260] cursor-pointer rounded-xl border border-emerald-400 bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={loading}
      >
        {loading ? 'טוען...' : 'Test Update Memory'}
      </button>
    </div>
  );
}

