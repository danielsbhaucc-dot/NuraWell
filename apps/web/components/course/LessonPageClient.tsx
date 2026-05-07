'use client';

import { useState, useTransition, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Clock, BookOpen, CheckCircle2, ExternalLink as ExternalLinkIcon,
  Video, Headphones, FileText, Presentation, AlignLeft, Layers, Images
} from 'lucide-react';
import { VideoPlayer } from './VideoPlayer';
import { AudioPlayer } from './AudioPlayer';
import { PDFViewer } from './PDFViewer';
import { ImageGallery } from './ImageGallery';
import { TaskChecklist } from './TaskChecklist';
import { HabitTracker } from './HabitTracker';
import { LessonNav } from './LessonNav';
import type { LessonDetail, LessonProgressData, MediaFile } from '../../lib/types/course';

interface NavLesson { id: string; title: string; }

interface LessonPageClientProps {
  lesson: LessonDetail;
  initialProgress: LessonProgressData;
  prevLesson: NavLesson | null;
  nextLesson: NavLesson | null;
  userId: string;
}

const typeLabel: Record<LessonDetail['lesson_type'], { label: string; icon: React.ElementType; color: string }> = {
  video:        { label: 'וידאו',  icon: Video,        color: '#6366f1' },
  audio:        { label: 'אודיו',  icon: Headphones,   color: '#f97316' },
  text:         { label: 'טקסט',   icon: AlignLeft,    color: '#14b8a6' },
  pdf:          { label: 'PDF',    icon: FileText,     color: '#ef4444' },
  presentation: { label: 'מצגת',  icon: Presentation, color: '#a855f7' },
  mixed:        { label: 'מגוון', icon: Layers,        color: '#10b981' },
};

async function saveProgress(
  userId: string,
  lessonId: string,
  update: Partial<LessonProgressData>
): Promise<void> {
  await fetch('/api/v1/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lesson_id: lessonId, ...update }),
  });
}

export function LessonPageClient({
  lesson, initialProgress, prevLesson, nextLesson, userId
}: LessonPageClientProps) {
  const [progress, setProgress] = useState<LessonProgressData>(initialProgress);
  const [isPending, startTransition] = useTransition();
  const config = typeLabel[lesson.lesson_type];
  const IconComp = config.icon;

  const handleTaskToggle = useCallback(async (taskId: string, completed: boolean) => {
    const newTaskProgress = { ...progress.task_progress, [taskId]: completed };
    setProgress(p => ({ ...p, task_progress: newTaskProgress }));
    await saveProgress(userId, lesson.id, { task_progress: newTaskProgress });
  }, [progress.task_progress, userId, lesson.id]);

  const handleHabitToggle = useCallback(async (habitId: string, dayIndex: number, completed: boolean) => {
    const currentDays = progress.habit_progress[habitId] || Array(7).fill(false);
    const newDays = [...currentDays];
    newDays[dayIndex] = completed;
    const newHabitProgress = { ...progress.habit_progress, [habitId]: newDays };
    setProgress(p => ({ ...p, habit_progress: newHabitProgress }));
    await saveProgress(userId, lesson.id, { habit_progress: newHabitProgress });
  }, [progress.habit_progress, userId, lesson.id]);

  const handleMarkComplete = useCallback(() => {
    startTransition(async () => {
      setProgress(p => ({ ...p, is_completed: true }));
      await saveProgress(userId, lesson.id, { is_completed: true });
    });
  }, [userId, lesson.id]);

  const videoFiles = lesson.media_files.filter(m => m.video_provider !== null || m.file_type === 'video_url');
  const audioFiles = lesson.media_files.filter(m => m.file_type === 'audio');
  const pdfFiles   = lesson.media_files.filter(m => m.file_type === 'pdf' || m.file_type === 'presentation');
  const imageFiles = lesson.media_files.filter(m => m.file_type === 'image');

  return (
    <div className="min-h-screen bg-mesh-subtle">
      <div className="container-mobile py-4 pb-8 space-y-5">

        {/* Lesson Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="glass-card p-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${config.color}22`, border: `1px solid ${config.color}44` }}>
              <IconComp className="w-5 h-5" style={{ color: config.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-semibold" style={{ color: config.color }}>{config.label}</span>
                {lesson.duration_minutes && (
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span>{lesson.duration_minutes} דקות</span>
                  </div>
                )}
                {progress.is_completed && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#a7f3d0' }}>
                    <CheckCircle2 className="w-3 h-3" /> הושלם
                  </span>
                )}
              </div>
              <h1 className="text-xl font-black text-white leading-snug">{lesson.title}</h1>
              {lesson.description && (
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">{lesson.description}</p>
              )}
            </div>
          </div>

          <div className="divider-gradient mt-3 mb-3" />

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <BookOpen className="w-3.5 h-3.5 text-primary-400" />
            <span className="text-primary-300">{lesson.course.title}</span>
          </div>
        </motion.div>

        {/* Video Content */}
        {videoFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {videoFiles.map((file) => (
              <VideoPlayer
                key={file.id}
                provider={file.video_provider!}
                externalId={file.video_external_id}
                externalUrl={file.video_external_url}
                title={lesson.title}
              />
            ))}
          </motion.div>
        )}

        {/* Audio Content */}
        {audioFiles.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            aria-label="נגן אודיו"
          >
            {audioFiles.map((file) => (
              <AudioPlayer
                key={file.id}
                src={file.uploadthing_url!}
                title={file.uploadthing_name ?? lesson.title}
                duration={file.duration_seconds}
              />
            ))}
          </motion.section>
        )}

        {/* Text Content */}
        {lesson.text_content && (
          <motion.article
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="glass-card p-5"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(to bottom, #14b8a6, #10b981)' }} />
              <AlignLeft className="w-4 h-4 text-primary-400" />
              <h2 className="font-black text-white text-base">תוכן השיעור</h2>
            </div>
            <div
              className="lesson-content"
              dangerouslySetInnerHTML={{ __html: lesson.text_content }}
            />
          </motion.article>
        )}

        {/* PDF / Presentation */}
        {pdfFiles.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {pdfFiles.map((file) => (
              <PDFViewer
                key={file.id}
                url={file.uploadthing_url!}
                title={file.uploadthing_name ?? undefined}
                fileName={file.uploadthing_name ?? undefined}
              />
            ))}
          </motion.section>
        )}

        {/* Images */}
        {imageFiles.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(to bottom, #f97316, #fb923c)' }} />
              <Images className="w-4 h-4 text-orange-400" />
              <span className="text-base font-black text-white">תמונות</span>
            </div>
            <ImageGallery
              images={imageFiles.map(f => ({ url: f.uploadthing_url!, name: f.uploadthing_name ?? undefined }))}
            />
          </motion.section>
        )}

        {/* External Links */}
        {lesson.external_links.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="glass-card p-4"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(to bottom, #3b82f6, #60a5fa)' }} />
              <ExternalLinkIcon className="w-4 h-4 text-blue-400" />
              <h3 className="font-black text-white text-base">קישורים נוספים</h3>
            </div>
            <div className="space-y-2">
              {lesson.external_links.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 rounded-xl transition-all hover:bg-white/8"
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)' }}>
                    <ExternalLinkIcon className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <span className="text-sm text-slate-200 hover:text-white font-semibold flex-1">{link.label}</span>
                  <ExternalLinkIcon className="w-3 h-3 text-slate-600" />
                </a>
              ))}
            </div>
          </motion.div>
        )}

        {/* Divider */}
        {(lesson.tasks.length > 0 || lesson.habits.length > 0) && (
          <div className="divider-gradient" />
        )}

        {/* Tasks */}
        {lesson.tasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <TaskChecklist
              tasks={lesson.tasks}
              completedTaskIds={progress.task_progress}
              lessonId={lesson.id}
              onTaskToggle={handleTaskToggle}
            />
          </motion.div>
        )}

        {/* Habits */}
        {lesson.habits.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <HabitTracker
              habits={lesson.habits}
              habitProgress={progress.habit_progress}
              lessonId={lesson.id}
              onHabitToggle={handleHabitToggle}
            />
          </motion.div>
        )}

        {/* Lesson Nav */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <LessonNav
            prevLesson={prevLesson}
            nextLesson={nextLesson}
            isCurrentCompleted={progress.is_completed}
            onMarkComplete={handleMarkComplete}
            isMarkingComplete={isPending}
          />
        </motion.div>
      </div>
    </div>
  );
}
