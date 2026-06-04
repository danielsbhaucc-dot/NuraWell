'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  FileText,
  Film,
  FolderOpen,
  ImageIcon,
  Loader2,
  Music,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { FileSubtype, MediaKind } from '@/lib/validation/media-asset';
import { ToastContainer, useToast } from '@/components/shared/Toast';
import { GlassConfirmDialog } from './GlassConfirmDialog';
import { CreditBadge } from './CreditBadge';
import { MediaUploadZone } from './MediaUploadZone';
import { MediaStockSearch } from './MediaStockSearch';
import { MediaAssetEditPanel, deleteMediaAsset } from './MediaAssetEditPanel';
import { MediaAssetPreview } from './MediaAssetPreview';
import { glassOverlayClass, glassPanelStyle, glassInputClass } from './glass-styles';
import {
  FILE_TAB_LABELS,
  KIND_LABELS,
  type MediaAsset,
  type MediaManagerMode,
  type OpenMediaManagerOptions,
} from './types';

type MediaManagerProps = {
  open: boolean;
  options: OpenMediaManagerOptions | null;
  onClose: () => void;
};

const ALL_KINDS: MediaKind[] = ['image', 'audio', 'file', 'video'];

const FILE_SUBTYPES: FileSubtype[] = [
  'pdf',
  'presentation',
  'word',
  'spreadsheet',
  'archive',
  'other',
];

function kindIcon(kind: MediaKind) {
  if (kind === 'image') return ImageIcon;
  if (kind === 'audio') return Music;
  if (kind === 'video') return Film;
  return FileText;
}

export function MediaManager({ open, options, onClose }: MediaManagerProps) {
  const toast = useToast();
  const allowedKinds = useMemo(() => {
    const k = options?.kind;
    if (!k) return ALL_KINDS;
    return Array.isArray(k) ? k : [k];
  }, [options?.kind]);

  const [activeKind, setActiveKind] = useState<MediaKind>(allowedKinds[0] ?? 'image');
  const [fileSubtype, setFileSubtype] = useState<FileSubtype>('pdf');
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [panel, setPanel] = useState<'library' | 'upload' | 'stock'>('library');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const mode: MediaManagerMode = options?.mode ?? 'browse';

  useEffect(() => {
    if (!open) return;
    setActiveKind(allowedKinds[0] ?? 'image');
    setPanel('library');
    setSelected(null);
    setSearchQ('');
  }, [open, allowedKinds]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ per_page: '36', page: '1' });
      params.set('kind', activeKind);
      if (activeKind === 'file') params.set('file_subtype', fileSubtype);
      if (searchQ.trim()) params.set('q', searchQ.trim());
      const res = await fetch(`/api/v1/admin/media?${params}`, { credentials: 'include' });
      const data = (await res.json()) as { items?: MediaAsset[]; error?: string };
      if (!res.ok) {
        const msg =
          data.error && /media_assets|relation|does not exist|schema/i.test(data.error)
            ? 'טבלת המדיה לא קיימת עדיין. הריצו את המיגרציה 000034_media_assets.'
            : data.error || `טעינה נכשלה (${res.status})`;
        setLoadError(msg);
        setItems([]);
        return;
      }
      setItems(data.items ?? []);
    } catch {
      setLoadError('שגיאת רשת — לא הצלחנו לטעון את הספרייה.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeKind, fileSubtype, searchQ]);

  useEffect(() => {
    if (open && panel === 'library') void load();
  }, [open, panel, load]);

  const handleSelect = (asset: MediaAsset) => {
    if (mode === 'pick' && options?.onSelect) {
      options.onSelect(asset);
      onClose();
      return;
    }
    setSelected(asset);
  };

  const onAssetUploaded = (asset: MediaAsset) => {
    toast.success('הועלה בהצלחה');
    setItems((prev) => [asset, ...prev]);
    setPanel('library');
    setSelected(asset);
  };

  const addVideo = async () => {
    const title = videoTitle.trim();
    const id = videoId.trim();
    const url = videoUrl.trim();
    if (!title || (!id && !url)) {
      toast.warning('חסרים פרטים', 'הזן כותרת ומזהה או URL');
      return;
    }
    setVideoBusy(true);
    try {
      const res = await fetch('/api/v1/admin/media/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'video',
          title,
          provider: 'bunny',
          external_id: id || undefined,
          external_url: url || undefined,
          source: 'upload',
        }),
      });
      const data = (await res.json()) as MediaAsset & { error?: string };
      if (!res.ok) throw new Error(data.error || 'שמירה נכשלה');
      toast.success('וידאו נוסף');
      setItems((prev) => [data, ...prev]);
      setVideoTitle('');
      setVideoId('');
      setVideoUrl('');
      setPanel('library');
    } catch (e) {
      toast.error('שגיאה', e instanceof Error ? e.message : 'הוספת וידאו נכשלה');
    } finally {
      setVideoBusy(false);
    }
  };

  const [videoTitle, setVideoTitle] = useState('');
  const [videoId, setVideoId] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoBusy, setVideoBusy] = useState(false);

  if (!open) return null;

  return (
    <>
      <div className={glassOverlayClass} onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        dir="rtl"
        className="fixed inset-4 z-[290] mx-auto flex max-h-[min(92dvh,900px)] max-w-6xl flex-col overflow-hidden rounded-[26px] outline-none sm:inset-6"
        style={glassPanelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="relative shrink-0 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(120deg, rgba(16,185,129,0.58) 0%, rgba(13,148,136,0.42) 52%, rgba(8,145,178,0.5) 100%)',
            }}
            aria-hidden
          />
          <div
            className="absolute inset-x-0 bottom-0 h-px"
            style={{ background: 'rgba(255,255,255,0.45)' }}
            aria-hidden
          />
          <div className="relative flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/45 bg-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-md">
                <FolderOpen className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-black text-white drop-shadow-sm">
                  {options?.title ?? 'מנהל קבצים'}
                </h2>
                <p className="truncate text-xs font-medium text-white/85">
                  {mode === 'pick' ? 'בחרו פריט ולחצו עליו' : 'ספריית מדיה — העלאה, עריכה ומחיקה'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגירה"
              className="shrink-0 rounded-xl border border-white/45 bg-white/15 p-2 text-white shadow-sm backdrop-blur-md transition hover:bg-white/30"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/35 px-3 py-2 lg:w-48 lg:flex-col lg:border-b-0 lg:border-l">
            {allowedKinds.length > 1 ? (
              <p className="hidden px-2 pb-1 text-[10px] font-black tracking-wide text-slate-500 lg:block">
                קטגוריות
              </p>
            ) : null}
            {allowedKinds.map((k) => {
              const Icon = kindIcon(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setActiveKind(k);
                    setPanel('library');
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold whitespace-nowrap transition',
                    activeKind === k
                      ? 'bg-emerald-800/80 text-white'
                      : 'text-slate-700 hover:bg-white/25'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {KIND_LABELS[k]}
                </button>
              );
            })}
          </nav>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {activeKind === 'file' ? (
              <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/30 px-3 py-2">
                {FILE_SUBTYPES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setFileSubtype(st)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-bold',
                      fileSubtype === st ? 'bg-teal-800/75 text-white' : 'text-slate-600'
                    )}
                  >
                    {FILE_TAB_LABELS[st]}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex shrink-0 gap-2 border-b border-white/30 px-3 py-2">
              <button
                type="button"
                onClick={() => setPanel('library')}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-bold',
                  panel === 'library' ? 'bg-slate-900/75 text-white' : 'text-slate-600'
                )}
              >
                ספרייה
              </button>
              {activeKind !== 'video' ? (
                <button
                  type="button"
                  onClick={() => setPanel('upload')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold',
                    panel === 'upload' ? 'bg-slate-900/75 text-white' : 'text-slate-600'
                  )}
                >
                  <Upload className="h-3.5 w-3.5" />
                  העלאה
                </button>
              ) : null}
              {activeKind === 'image' ? (
                <button
                  type="button"
                  onClick={() => setPanel('stock')}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-bold',
                    panel === 'stock' ? 'bg-slate-900/75 text-white' : 'text-slate-600'
                  )}
                >
                  Pixabay / Pexels
                </button>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {panel === 'library' ? (
                <>
                  <div className="mb-3 flex gap-2">
                    <input
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                      className={glassInputClass}
                      placeholder="חיפוש…"
                      onKeyDown={(e) => e.key === 'Enter' && void load()}
                    />
                    <button
                      type="button"
                      onClick={() => void load()}
                      className="shrink-0 rounded-xl bg-slate-900/75 px-3 text-white"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                  </div>
                  {loadError ? (
                    <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-200/20 px-3 py-2.5 text-sm text-amber-900 backdrop-blur-sm">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-bold">{loadError}</p>
                        <button
                          type="button"
                          onClick={() => void load()}
                          className="mt-1 rounded-lg border border-amber-400/60 bg-white/25 px-2.5 py-1 text-xs font-bold"
                        >
                          נסה שוב
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {loading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-emerald-700" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            'group relative rounded-xl border transition',
                            selected?.id === item.id
                              ? 'border-emerald-500 ring-2 ring-emerald-400/60'
                              : 'border-white/45 hover:border-emerald-400/50'
                          )}
                          style={{ background: 'rgba(255,255,255,0.15)' }}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelect(item)}
                            className="block w-full overflow-hidden rounded-xl text-right"
                          >
                            <AssetThumb asset={item} />
                            <p className="truncate px-2 py-1.5 text-[11px] font-bold text-slate-800">
                              {item.title ?? 'ללא שם'}
                            </p>
                          </button>
                          <div className="absolute top-1 left-1 z-10">
                            <CreditBadge asset={item} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!loading && !loadError && items.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/45 bg-white/15 backdrop-blur-sm">
                        <FolderOpen className="h-7 w-7 text-slate-500" />
                      </div>
                      <p className="text-sm font-bold text-slate-700">
                        אין עדיין פריטים בקטגוריה {KIND_LABELS[activeKind]}
                      </p>
                      {activeKind !== 'video' ? (
                        <button
                          type="button"
                          onClick={() => setPanel('upload')}
                          className="rounded-xl bg-emerald-800/85 px-4 py-2 text-xs font-bold text-white"
                        >
                          העלאה עכשיו
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}

              {panel === 'upload' && activeKind !== 'video' ? (
                <MediaUploadZone
                  kind={activeKind as 'image' | 'audio' | 'file'}
                  onUploaded={onAssetUploaded}
                  onError={(msg) => toast.error('העלאה נכשלה', msg)}
                />
              ) : null}

              {panel === 'stock' && activeKind === 'image' ? (
                <MediaStockSearch
                  onImported={onAssetUploaded}
                  onError={(msg) => toast.error('ייבוא נכשל', msg)}
                />
              ) : null}

              {activeKind === 'video' ? (
                <div className="mt-4 space-y-3 rounded-2xl border border-white/40 p-4" style={{ background: 'rgba(255,255,255,0.12)' }}>
                  <p className="text-sm font-bold text-slate-800">הוספת וידאו Bunny (video.nurawell.ai)</p>
                  <input
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                    className={glassInputClass}
                    placeholder="כותרת"
                  />
                  <input
                    value={videoId}
                    onChange={(e) => setVideoId(e.target.value)}
                    className={glassInputClass}
                    placeholder="UUID של הסרטון"
                    dir="ltr"
                  />
                  <input
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    className={glassInputClass}
                    placeholder="או URL מלא ל-HLS"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    disabled={videoBusy}
                    onClick={() => void addVideo()}
                    className="rounded-xl bg-emerald-800/85 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {videoBusy ? 'שומר…' : 'שמור וידאו'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {selected ? (
            <button
              type="button"
              aria-label="סגור תצוגה"
              onClick={() => setSelected(null)}
              className="fixed inset-0 z-[295] bg-slate-900/40 backdrop-blur-sm lg:hidden"
            />
          ) : null}
          <aside
            className={cn(
              'flex-col gap-3 overflow-y-auto p-4',
              selected
                ? 'fixed inset-x-0 bottom-0 z-[300] flex max-h-[85dvh] rounded-t-[26px] border-t border-white/45 shadow-[0_-14px_44px_rgba(6,78,59,0.28)]'
                : 'hidden',
              'lg:static lg:z-auto lg:flex lg:max-h-none lg:w-72 lg:shrink-0 lg:rounded-none lg:border-t-0 lg:border-r lg:border-white/35 lg:shadow-none'
            )}
            style={{ background: 'rgba(245,250,248,0.55)', backdropFilter: 'blur(22px)' }}
          >
            <div className="relative mb-1 flex h-5 items-center lg:hidden">
              <span
                className="absolute left-1/2 top-1 h-1.5 w-12 -translate-x-1/2 rounded-full bg-slate-400/50"
                aria-hidden
              />
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="סגור תצוגה"
                className="ml-auto rounded-lg border border-white/50 bg-white/40 p-1.5 text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {selected ? <MediaAssetPreview asset={selected} /> : null}
            <MediaAssetEditPanel
              asset={selected}
              onSaved={(a) => {
                setSelected(a);
                setItems((prev) => prev.map((x) => (x.id === a.id ? a : x)));
                toast.success('נשמר');
              }}
              onDeleted={(id) => {
                setItems((prev) => prev.filter((x) => x.id !== id));
                setSelected(null);
                setConfirmDelete(false);
                toast.success('נמחק');
              }}
              onRequestDelete={() => setConfirmDelete(true)}
              deleteBusy={deleteBusy}
            />
            {mode === 'pick' && selected ? (
              <button
                type="button"
                onClick={() => handleSelect(selected)}
                className="mt-3 w-full rounded-xl bg-emerald-700/90 py-2.5 text-sm font-bold text-white"
              >
                בחר פריט זה
              </button>
            ) : null}
          </aside>
        </div>
      </div>

      <GlassConfirmDialog
        open={confirmDelete}
        title="מחיקה לצמיתות"
        message="הקובץ יימחק מ-R2 ומהמסד. לא ניתן לשחזר."
        confirmLabel="מחק"
        danger
        busy={deleteBusy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!selected) return;
          setDeleteBusy(true);
          const ok = await deleteMediaAsset(selected.id);
          setDeleteBusy(false);
          if (ok) {
            setItems((prev) => prev.filter((x) => x.id !== selected.id));
            setSelected(null);
            setConfirmDelete(false);
            toast.success('נמחק');
          } else toast.error('מחיקה נכשלה');
        }}
      />

      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
    </>
  );
}

function AssetThumb({ asset }: { asset: MediaAsset }) {
  const url = asset.url ?? asset.public_url ?? asset.external_url;
  if (asset.kind === 'image' && url) {
    return <img src={url} alt="" className="aspect-square w-full object-cover" />;
  }
  if (asset.kind === 'audio') {
    return (
      <div className="flex aspect-square items-center justify-center bg-emerald-900/20">
        <Music className="h-10 w-10 text-emerald-800/70" />
      </div>
    );
  }
  if (asset.kind === 'video') {
    return (
      <div className="flex aspect-square items-center justify-center bg-violet-900/15">
        <Film className="h-10 w-10 text-violet-800/70" />
      </div>
    );
  }
  return (
    <div className="flex aspect-square items-center justify-center bg-slate-900/10">
      <FileText className="h-10 w-10 text-slate-600" />
    </div>
  );
}
