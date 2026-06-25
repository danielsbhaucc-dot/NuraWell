'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { X, ChevronRight, ChevronLeft, ZoomIn } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDialogA11y } from '@/lib/a11y/use-dialog-a11y';
import { mediaAltText } from '@/lib/a11y/alt-text';

interface ImageItem {
  url: string;
  name?: string;
}

interface ImageGalleryProps {
  images: ImageItem[];
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const open = lightboxIndex !== null;

  useEffect(() => setMounted(true), []);

  const closeLightbox = () => setLightboxIndex(null);
  const prev = () =>
    setLightboxIndex((i) => (i != null ? (i - 1 + images.length) % images.length : null));
  const next = () => setLightboxIndex((i) => (i != null ? (i + 1) % images.length : null));

  useDialogA11y({
    open,
    onClose: closeLightbox,
    containerRef: lightboxRef,
  });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setLightboxIndex((i) => (i != null ? (i - 1 + images.length) % images.length : i));
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setLightboxIndex((i) => (i != null ? (i + 1) % images.length : i));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, images.length]);

  if (!images.length) return null;

  return (
    <>
      <div
        className={`grid gap-3 ${images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'}`}
      >
        {images.map((img, idx) => {
          const alt = mediaAltText({ name: img.name, fallback: `תמונה ${idx + 1}` });
          return (
            <motion.button
              key={idx}
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setLightboxIndex(idx)}
              aria-label={`הגדל ${alt}`}
              className="relative rounded-2xl overflow-hidden group"
              style={{
                aspectRatio: images.length === 1 ? '16/9' : '1',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <Image
                src={img.url}
                alt={alt}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 768px) 50vw, 33vw"
              />
              <div
                className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center"
                aria-hidden
              >
                <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </motion.button>
          );
        })}
      </div>

      {mounted
        ? createPortal(
      <AnimatePresence>
        {open && lightboxIndex !== null ? (
          <motion.div
            key="image-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(20px)' }}
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="סגור תצוגת תמונה"
              onClick={closeLightbox}
            />
            <motion.div
              ref={lightboxRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-3xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
                <Image
                  src={images[lightboxIndex].url}
                  alt={mediaAltText({
                    name: images[lightboxIndex].name,
                    fallback: `תמונה ${lightboxIndex + 1}`,
                  })}
                  fill
                  className="object-contain"
                  sizes="100vw"
                  priority
                />
              </div>

              <p id={titleId} className="text-center text-slate-400 text-sm mt-3">
                {lightboxIndex + 1} / {images.length}
                {images[lightboxIndex].name ? ` · ${images[lightboxIndex].name}` : ''}
              </p>

              <button
                type="button"
                onClick={closeLightbox}
                aria-label="סגור"
                className="absolute -top-4 -left-4 w-10 h-10 rounded-full flex items-center justify-center text-white"
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <X className="w-5 h-5" aria-hidden />
              </button>

              {images.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={next}
                    aria-label="תמונה הבאה"
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
                  >
                    <ChevronLeft className="w-5 h-5 text-white" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={prev}
                    aria-label="תמונה קודמת"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
                  >
                    <ChevronRight className="w-5 h-5 text-white" aria-hidden />
                  </button>
                </>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>,
      document.body
        )
        : null}
    </>
  );
}
