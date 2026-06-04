'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Film,
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
    try {
      const params = new URLSearchParams({ per_page: '36', page: '1' });
      params.set('kind', activeKind);
      if (activeKind === 'file') params.set('file_subtype', fileSubtype);
      if (searchQ.trim()) params.set('q', searchQ.trim());
      const res = await fetch(`/api/v1/admin/media?${params}`, { credentials: 'include' });
      const data = (await res.json()) as { items?: MediaAsset[]; error?: string };
      if (!res.ok) {
        toast.error('טעינה נכשלה', data.error);
        setItems([]);
        return;
      }
      setItems(data.items ?? []);
    } catch {
      toast.error('שגיאת רשת', 'לא הצלחנו לטעון את הספרייה');
    } finally {
      setLoading(false);
    }
  }, [activeKind, fileSubtype, searchQ, toast]);

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
        <header className="flex shrink-0 items-center justify-between border-b border-white/40 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-lg font-black text-slate-900">
              {options?.title ?? 'מנהל קבצים'}
            </h2>
            <p className="text-xs text-slate-600">
              {mode === 'pick' ? 'בחר קובץ ולחץ עליו' : 'ספריית מדיה — העלאה, עריכה ומחיקה'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/50 bg-white/20 p-2 text-slate-800 backdrop-blur-sm"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/35 px-3 py-2 lg:w-44 lg:flex-col lg:border-b-0 lg:border-l">
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
                  {loading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-emerald-700" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelect(item)}
                          className={cn(
                            'group relative overflow-hidden rounded-xl border text-right transition',
                            selected?.id === item.id
                              ? 'border-emerald-500 ring-2 ring-emerald-400/60'
                              : 'border-white/45 hover:border-emerald-400/50'
                          )}
                          style={{ background: 'rgba(255,255,255,0.15)' }}
                        >
                          <AssetThumb asset={item} />
                          <div className="absolute top-1 left-1">
                            <CreditBadge asset={item} />
                          </div>
                          <p className="truncate px-2 py-1.5 text-[11px] font-bold text-slate-800">
                            {item.title ?? 'ללא שם'}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  {!loading && items.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-600">אין פריטים — העלה או חפש.</p>
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

          <aside className="w-full shrink-0 space-y-3 border-t border-white/35 p-4 lg:w-72 lg:border-t-0 lg:border-r">
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
