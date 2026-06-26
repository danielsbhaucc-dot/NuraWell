'use client';

import { useCallback, useRef, useState } from 'react';
import { Bold, Italic, Highlighter, Sparkles, Eye, Save, Loader2 } from 'lucide-react';
import { sanitizeLessonHtml } from '@/lib/sanitize-lesson-html';

interface GuideLessonEditorProps {
  lessonId: string;
  guideId: string;
  initialTitle: string;
  initialDescription: string | null;
  initialContent: string | null;
  onSaved?: () => void;
}

function wrapSelection(textarea: HTMLTextAreaElement, before: string, after: string) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const next = `${textarea.value.slice(0, start)}${before}${selected}${after}${textarea.value.slice(end)}`;
  return { next, cursor: start + before.length + selected.length };
}

export function GuideLessonEditor({
  lessonId,
  guideId,
  initialTitle,
  initialDescription,
  initialContent,
  onSaved,
}: GuideLessonEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [content, setContent] = useState(initialContent ?? '<p></p>');
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const applyWrap = useCallback((before: string, after: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const { next, cursor } = wrapSelection(el, before, after);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/guides/${guideId}/lessons/${lessonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          text_content: content,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'שגיאת שמירה');
      setMsg('נשמר');
      onSaved?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-emerald-100/80 bg-white/70 p-4 backdrop-blur-md" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="flex-1 min-w-[180px] rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="כותרת פרק"
        />
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
        >
          <Eye className="h-3.5 w-3.5" />
          {preview ? 'עריכה' : 'תצוגה מקדימה'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          שמור פרק
        </button>
      </div>

      <textarea
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-[56px]"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="תיאור קצר לפרק"
      />

      {!preview ? (
        <>
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 p-2">
            <button type="button" onClick={() => applyWrap('<strong>', '</strong>')} className="guide-editor-btn" title="מודגש">
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => applyWrap('<em>', '</em>')} className="guide-editor-btn" title="נטוי">
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyWrap('<mark class="glass-marker">', '</mark>')}
              className="guide-editor-btn"
              title="הדגשת זכוכית"
            >
              <Highlighter className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => applyWrap('<h2>', '</h2>')} className="guide-editor-btn text-[11px] font-black">
              H2
            </button>
            <button type="button" onClick={() => applyWrap('<ul>\n<li>', '</li>\n</ul>')} className="guide-editor-btn text-[11px] font-black">
              רשימה
            </button>
            <button
              type="button"
              onClick={() => applyWrap('<blockquote class="glass-quote">', '</blockquote>')}
              className="guide-editor-btn"
              title="ציטוט"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
          </div>
          <textarea
            ref={textareaRef}
            dir="rtl"
            className="guide-lesson-code-editor w-full min-h-[220px] rounded-xl border border-slate-200 p-3 text-sm font-mono"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="<p>תוכן HTML…</p>"
          />
        </>
      ) : (
        <article className="guide-glass-card p-4">
          <div
            className="lesson-content"
            dangerouslySetInnerHTML={{ __html: sanitizeLessonHtml(content) }}
          />
        </article>
      )}

      {msg ? <p className="text-xs font-bold text-emerald-700">{msg}</p> : null}
    </div>
  );
}
