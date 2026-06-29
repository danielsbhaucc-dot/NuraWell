'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Mic, Save } from 'lucide-react';
import type { ChallengeIntroLine } from '@/lib/challenge/content';

export function AdminChallengeIntroEditor() {
  const [lines, setLines] = useState<ChallengeIntroLine[]>([]);
  const [ttsText, setTtsText] = useState('');
  const [ttsUrl, setTtsUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/challenge/intro', { credentials: 'include' });
      const data = await res.json();
      setLines(data.lines ?? []);
      setTtsUrl(data.tts_url ?? null);
      setTtsText(data.tts_text ?? '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveLines = async () => {
    setSaving(true);
    try {
      await fetch('/api/v1/admin/challenge/intro', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      });
    } finally {
      setSaving(false);
    }
  };

  const syncTts = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/v1/admin/challenge/intro', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_tts: true, tts_text: ttsText }),
      });
      const data = await res.json();
      if (data.tts_url) setTtsUrl(data.tts_url);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-200/60 bg-white/70 p-5 shadow-sm backdrop-blur-md sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-slate-900">טקst פתיחה + ElevenLabs</h2>
      <p className="mb-4 text-sm text-slate-600">
        שורות הפתיחה אחרי השיר. השתמש ב-{'{firstName}'} לשם פרטי.
      </p>

      <div className="space-y-3">
        {lines.map((line, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={line.text}
              onChange={(e) => {
                const next = [...lines];
                next[i] = { ...line, text: e.target.value };
                setLines(next);
              }}
              className="min-h-11 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-1 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={Boolean(line.emphasis)}
                onChange={(e) => {
                  const next = [...lines];
                  next[i] = { ...line, emphasis: e.target.checked };
                  setLines(next);
                }}
              />
              הדגשה
            </label>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={saveLines}
        className="mt-4 inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        שמור שורות
      </button>

      <hr className="my-6 border-slate-200" />

      <label className="mb-2 block text-sm font-semibold text-slate-700">תמלול ElevenLabs (Liam)</label>
      <textarea
        value={ttsText}
        onChange={(e) => setTtsText(e.target.value)}
        rows={5}
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        placeholder="היי, נעים להכיר — אני אלמוג!..."
      />
      <button
        type="button"
        disabled={syncing || !ttsText.trim()}
        onClick={syncTts}
        className="mt-3 inline-flex items-center gap-1 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
        {syncing ? 'מתחבר ל-ElevenLabs...' : 'יצירת תמלול'}
      </button>
      {ttsUrl ? (
        <audio controls src={ttsUrl} className="mt-4 w-full" preload="none" />
      ) : null}
    </div>
  );
}
