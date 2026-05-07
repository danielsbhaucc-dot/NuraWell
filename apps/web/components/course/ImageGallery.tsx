'use client';

import { useState } from 'react';
import Image from 'next/image';
import { X, ChevronRight, ChevronLeft, ZoomIn } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageItem {
  url: string;
  name?: string;
}

interface ImageGalleryProps {
  images: ImageItem[];
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!images.length) return null;

  const openLightbox = (idx: number) => setLightboxIndex(idx);
  const closeLightbox = () => setLightboxIndex(null);
  const prev = () => setLightboxIndex(i => (i != null ? (i - 1 + images.length) % images.length : null));
  const next = () => setLightboxIndex(i => (i != null ? (i + 1) % images.length : null));

  return (
    <>
      {/* Grid */}
      <div className={`grid gap-3 ${images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'}`}>
        {images.map((img, idx) => (
          <motion.button
            key={idx}
            whileTap={{ scale: 0.97 }}
            onClick={() => openLightbox(idx)}
            className="relative rounded-2xl overflow-hidden group"
            style={{ aspectRatio: images.length === 1 ? '16/9' : '1', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <Image
              src={img.url}
              alt={img.name || `תמונה ${idx + 1}`}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 768px) 50vw, 33vw"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
              <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </motion.button>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(20px)' }}
            onClick={closeLightbox}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-3xl w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
                <Image
                  src={images[lightboxIndex].url}
                  alt={images[lightboxIndex].name || `תמונה ${lightboxIndex + 1}`}
                  fill
                  className="object-contain"
                  sizes="100vw"
                  priority
                />
              </div>

              {/* Counter */}
              <p className="text-center text-slate-400 text-sm mt-3">
                {lightboxIndex + 1} / {images.length}
                {images[lightboxIndex].name && ` · ${images[lightboxIndex].name}`}
              </p>

              {/* Close */}
              <button
                onClick={closeLightbox}
                className="absolute -top-4 -left-4 w-10 h-10 rounded-full flex items-center justify-center text-white"
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                <X className="w-5 h-5" />
              </button>

              {/* Prev/Next */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={next}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
                  >
                    <ChevronLeft className="w-5 h-5 text-white" />
                  </button>
                  <button
                    onClick={prev}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
                  >
                    <ChevronRight className="w-5 h-5 text-white" />
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
