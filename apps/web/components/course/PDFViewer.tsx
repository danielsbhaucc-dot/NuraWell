'use client';

import { useState } from 'react';
import { FileText, Download, ExternalLink, ChevronRight, ChevronLeft } from 'lucide-react';

interface PDFViewerProps {
  url: string;
  title?: string;
  fileName?: string;
}

export function PDFViewer({ url, title, fileName }: PDFViewerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<'embed' | 'link'>('embed');

  const displayName = title || fileName || 'מסמך PDF';

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <FileText className="w-4 h-4 text-red-400" />
          </div>
          <p className="text-white text-sm font-semibold line-clamp-1">{displayName}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href={url}
            download={fileName || 'document.pdf'}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)' }}
            aria-label="הורד PDF"
          >
            <Download className="w-4 h-4" />
          </a>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)' }}
            aria-label="פתח בחלון חדש"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* PDF Embed */}
      <div className="relative" style={{ height: '70vh', minHeight: '400px', background: '#1a1a2e' }}>
        {!isLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <FileText className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-slate-400 text-sm">טוען מסמך...</p>
          </div>
        )}
        <iframe
          src={`${url}#toolbar=0&navpanes=0&scrollbar=1`}
          title={displayName}
          className="w-full h-full border-0"
          onLoad={() => setIsLoaded(true)}
          loading="lazy"
        />
      </div>

      {/* Footer hint for mobile */}
      <div className="px-4 py-2 flex items-center justify-center gap-2"
        style={{ background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-xs text-slate-500">
          💡 לחץ על
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary-400 mx-1 hover:underline">
            פתח בכרטיסייה חדשה
          </a>
          לחוויה מיטבית
        </p>
      </div>
    </div>
  );
}
