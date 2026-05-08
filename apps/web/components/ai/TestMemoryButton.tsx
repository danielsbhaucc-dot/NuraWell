'use client';

import { useState } from 'react';

export function TestMemoryButton() {
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        if (loading) return;
        setLoading(true);
        try {
          const res = await fetch('/api/v1/ai/memory', { method: 'GET' });
          const data = await res.json();
          console.log('[Test AI Memory]', data);
        } catch (error) {
          console.error('[Test AI Memory] request failed', error);
        } finally {
          setLoading(false);
        }
      }}
      className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:opacity-60"
      disabled={loading}
    >
      {loading ? 'טוען...' : 'Test AI Memory'}
    </button>
  );
}

